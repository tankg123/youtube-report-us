const axios = require("axios");

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/channels";
const YOUTUBE_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_PLAYLIST_ITEMS_API = "https://www.googleapis.com/youtube/v3/playlistItems";
const YOUTUBE_VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos";
const quotaState = {
  date: new Date().toISOString().slice(0, 10),
  estimatedUsed: 0,
  lastError: null,
  calls: [],
  keyIndex: 0,
  exhaustedKeys: {}
};

const quotaCosts = {
  "channels.list": 1,
  "search.list": 100,
  "playlistItems.list": 1,
  "videos.list": 1
};

function resetQuotaIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (quotaState.date !== today) {
    quotaState.date = today;
    quotaState.estimatedUsed = 0;
    quotaState.lastError = null;
    quotaState.calls = [];
    quotaState.keyIndex = 0;
    quotaState.exhaustedKeys = {};
  }
}

function getYoutubeApiKeys() {
  const keys = [
    ...(process.env.YOUTUBE_API_KEYS || "").split(/[\n,;]+/),
    process.env.YOUTUBE_API_KEY || ""
  ]
    .map((key) => String(key || "").trim())
    .filter(Boolean);

  return [...new Set(keys)];
}

function previewApiKey(key = "") {
  if (!key) return "";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

function apiKeyPreview() {
  return previewApiKey(getActiveYoutubeApiKey());
}

function getActiveYoutubeApiKey() {
  resetQuotaIfNeeded();
  const keys = getYoutubeApiKeys();
  if (!keys.length) return "";

  const start = quotaState.keyIndex % keys.length;
  for (let offset = 0; offset < keys.length; offset += 1) {
    const index = (start + offset) % keys.length;
    const key = keys[index];
    if (!quotaState.exhaustedKeys[key]) {
      quotaState.keyIndex = index;
      return key;
    }
  }

  return keys[start];
}

function markApiKeyExhausted(key, reason = "quotaExceeded") {
  if (!key) return;
  quotaState.exhaustedKeys[key] = {
    reason,
    time: new Date().toISOString()
  };

  const keys = getYoutubeApiKeys();
  const currentIndex = keys.indexOf(key);
  if (currentIndex >= 0 && keys.length > 1) {
    quotaState.keyIndex = (currentIndex + 1) % keys.length;
  }
}

function cleanYoutubeMessage(message = "") {
  return String(message || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseYoutubeError(error, key = "") {
  const payload = error.response?.data?.error;
  const detail = payload?.errors?.[0] || {};
  const reason = detail.reason || "";
  const rawMessage = cleanYoutubeMessage(payload?.message || error.message);
  const message = reason === "quotaExceeded"
    ? "YouTube API quota exceeded for this key. Use another API key or wait for Google quota reset."
    : rawMessage;

  return {
    status: error.response?.status || null,
    code: payload?.code || error.response?.status || null,
    reason,
    domain: detail.domain || "",
    message,
    key: previewApiKey(key || getActiveYoutubeApiKey()),
    time: new Date().toISOString()
  };
}

async function youtubeGet(url, options, endpoint, units = quotaCosts[endpoint] || 1) {
  resetQuotaIfNeeded();
  const keys = getYoutubeApiKeys();

  if (!keys.length) {
    throw new Error("Missing YOUTUBE_API_KEY or YOUTUBE_API_KEYS in .env");
  }

  const attempts = Math.max(1, keys.length);
  let lastEnhancedError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const key = getActiveYoutubeApiKey();
    const requestOptions = {
      ...options,
      params: {
        ...(options?.params || {}),
        key
      }
    };

    quotaState.estimatedUsed += units;
    quotaState.calls.unshift({
      endpoint,
      units,
      key: previewApiKey(key),
      time: new Date().toISOString()
    });
    quotaState.calls = quotaState.calls.slice(0, 30);

    try {
      return await axios.get(url, requestOptions);
    } catch (error) {
      const parsed = parseYoutubeError(error, key);
      quotaState.lastError = parsed;
      const suffix = parsed.reason ? ` (${parsed.reason})` : "";
      const enhanced = new Error(`${parsed.message || error.message}${suffix}`);
      enhanced.youtube = parsed;
      lastEnhancedError = enhanced;

      if (parsed.reason === "quotaExceeded" && keys.length > 1) {
        markApiKeyExhausted(key, parsed.reason);
        continue;
      }

      throw enhanced;
    }
  }

  throw lastEnhancedError || new Error("YouTube API request failed");
}

function getQuotaStatus() {
  resetQuotaIfNeeded();
  const dailyLimit = Number(process.env.YOUTUBE_DAILY_QUOTA_LIMIT || 10000);
  return {
    date: quotaState.date,
    daily_limit: dailyLimit,
    estimated_used: quotaState.estimatedUsed,
    estimated_remaining: Math.max(0, dailyLimit - quotaState.estimatedUsed),
    api_key: apiKeyPreview(),
    api_keys: getYoutubeApiKeys().map((key, index) => ({
      index: index + 1,
      key: previewApiKey(key),
      active: key === getActiveYoutubeApiKey(),
      exhausted: Boolean(quotaState.exhaustedKeys[key]),
      exhausted_reason: quotaState.exhaustedKeys[key]?.reason || ""
    })),
    last_error: quotaState.lastError,
    recent_calls: quotaState.calls,
    costs: quotaCosts,
    note: "YouTube does not expose exact project quota usage through an API key. These numbers are estimated from calls made by this backend since it started."
  };
}

function extractChannelInput(input) {
  if (!input) return "";

  let value = String(input).trim();

  if (value.includes("youtube.com/channel/")) {
    const match = value.match(/youtube\.com\/channel\/([^/?&#]+)/);
    return match ? match[1] : value;
  }

  if (value.includes("youtube.com/@")) {
    const match = value.match(/youtube\.com\/@([^/?&#]+)/);
    return match ? `@${match[1]}` : value;
  }

  if (value.startsWith("@")) {
    return value;
  }

  return value;
}

async function getChannelFromYoutube(input, options = {}) {
  const includeLatest = options.includeLatest !== false;
  const apiKey = getActiveYoutubeApiKey();

  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY or YOUTUBE_API_KEYS in .env");
  }

  const value = extractChannelInput(input);

  let params = {
    part: "snippet,statistics,contentDetails",
    key: apiKey
  };

  if (value.startsWith("@")) {
    params.forHandle = value;
  } else {
    params.id = value;
  }

  const response = await youtubeGet(YOUTUBE_API, {
    params,
    timeout: 15000
  }, "channels.list");

  const items = response.data?.items || [];

  if (!items.length) {
    throw new Error("Không tìm thấy channel trên YouTube");
  }

  const item = items[0];
  const snippet = item.snippet || {};
  const statistics = item.statistics || {};
  const thumbnails = snippet.thumbnails || {};
  const latestVideos = includeLatest
    ? await getLatestVideosFromUploads(item.contentDetails?.relatedPlaylists?.uploads, apiKey)
    : undefined;

  return {
    channel_id: item.id,
    title: snippet.title || "",
    description: snippet.description || "",
    custom_url: snippet.customUrl || "",
    thumbnail:
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      "",
    view_count: Number(statistics.viewCount || 0),
    subscriber_count: Number(statistics.subscriberCount || 0),
    video_count: Number(statistics.videoCount || 0),
    country: snippet.country || "",
    published_at: snippet.publishedAt || "",
    latest_videos: latestVideos
  };
}

async function getChannelsFromYoutube(inputs, options = {}) {
  const includeLatest = options.includeLatest === true;
  const apiKey = getActiveYoutubeApiKey();

  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY or YOUTUBE_API_KEYS in .env");
  }

  const ids = [...new Set((inputs || []).map(extractChannelInput).filter(Boolean))]
    .filter((value) => !value.startsWith("@"));
  const results = [];

  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const response = await youtubeGet(YOUTUBE_API, {
      params: {
        part: "snippet,statistics,contentDetails",
        id: batch.join(","),
        key: apiKey
      },
      timeout: 15000
    }, "channels.list");

      for (const item of response.data?.items || []) {
        const snippet = item.snippet || {};
        const statistics = item.statistics || {};
        const thumbnails = snippet.thumbnails || {};
        let latestVideos = [];

        if (includeLatest) {
          try {
            latestVideos = await getLatestVideosFromUploads(item.contentDetails?.relatedPlaylists?.uploads, apiKey);
          } catch {
            latestVideos = [];
          }
        }

        results.push({
        channel_id: item.id,
        title: snippet.title || "",
        description: snippet.description || "",
        custom_url: snippet.customUrl || "",
        thumbnail:
          thumbnails.high?.url ||
          thumbnails.medium?.url ||
          thumbnails.default?.url ||
          "",
        view_count: Number(statistics.viewCount || 0),
        subscriber_count: Number(statistics.subscriberCount || 0),
        video_count: Number(statistics.videoCount || 0),
        country: snippet.country || "",
        published_at: snippet.publishedAt || "",
        latest_videos: includeLatest ? latestVideos : undefined
      });
    }
  }

  return results;
}

async function getLatestVideos(channelId, apiKey) {
  const response = await youtubeGet(YOUTUBE_SEARCH_API, {
    params: {
      part: "snippet",
      channelId,
      maxResults: 2,
      order: "date",
      type: "video",
      key: apiKey
    },
    timeout: 15000
  }, "search.list");

  return (response.data?.items || []).map((item) => {
    const videoId = item.id?.videoId || "";
    const snippet = item.snippet || {};
    const thumbnails = snippet.thumbnails || {};

    return {
      video_id: videoId,
      title: snippet.title || "",
      published_at: snippet.publishedAt || "",
      thumbnail:
        thumbnails.medium?.url ||
        thumbnails.default?.url ||
        "",
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""
    };
  });
}

async function getLatestVideosFromUploads(uploadsPlaylistId, apiKey) {
  if (!uploadsPlaylistId) return [];

  const response = await youtubeGet(YOUTUBE_PLAYLIST_ITEMS_API, {
    params: {
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: 2,
      key: apiKey
    },
    timeout: 15000
  }, "playlistItems.list");

  return (response.data?.items || []).map((item) => {
    const snippet = item.snippet || {};
    const thumbnails = snippet.thumbnails || {};
    const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId || "";

    return {
      video_id: videoId,
      title: snippet.title || "",
      published_at: snippet.publishedAt || "",
      thumbnail:
        thumbnails.medium?.url ||
        thumbnails.default?.url ||
        "",
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""
    };
  });
}

async function getAllVideosFromYoutube(channelId) {
  const apiKey = getActiveYoutubeApiKey();

  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY or YOUTUBE_API_KEYS in .env");
  }

  const channelResponse = await youtubeGet(YOUTUBE_API, {
    params: {
      part: "snippet,contentDetails",
      id: channelId,
      key: apiKey
    },
    timeout: 15000
  }, "channels.list");

  const channel = channelResponse.data?.items?.[0];

  if (!channel) {
    throw new Error("Không tìm thấy channel trên YouTube");
  }

  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  const channelTitle = channel.snippet?.title || "";

  if (!uploadsPlaylistId) {
    return [];
  }

  const videoIds = [];
  let pageToken = "";

  do {
    const playlistResponse = await youtubeGet(YOUTUBE_PLAYLIST_ITEMS_API, {
      params: {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken,
        key: apiKey
      },
      timeout: 15000
    }, "playlistItems.list");

    for (const item of playlistResponse.data?.items || []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) videoIds.push(videoId);
    }

    pageToken = playlistResponse.data?.nextPageToken || "";
  } while (pageToken);

  const videos = [];

  for (let index = 0; index < videoIds.length; index += 50) {
    const ids = videoIds.slice(index, index + 50);
    const videoResponse = await youtubeGet(YOUTUBE_VIDEOS_API, {
      params: {
        part: "snippet,statistics",
        id: ids.join(","),
        key: apiKey
      },
      timeout: 15000
    }, "videos.list");

    for (const item of videoResponse.data?.items || []) {
      const snippet = item.snippet || {};
      const statistics = item.statistics || {};
      const thumbnails = snippet.thumbnails || {};

      videos.push({
        video_id: item.id,
        channel_id: channelId,
        channel_title: channelTitle,
        title: snippet.title || "",
        thumbnail:
          thumbnails.medium?.url ||
          thumbnails.default?.url ||
          "",
        published_at: snippet.publishedAt || "",
        view_count: Number(statistics.viewCount || 0)
      });
    }
  }

  return videos;
}

module.exports = {
  getChannelFromYoutube,
  getChannelsFromYoutube,
  getAllVideosFromYoutube,
  getQuotaStatus
};
