const crypto = require("crypto");
const axios = require("axios");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const CMS_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
  "https://www.googleapis.com/auth/youtubepartner",
  "https://www.googleapis.com/auth/youtubepartner-channel-audit"
];

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    process.env.GOOGLE_CMS_REDIRECT_URI ||
    `${process.env.BACKEND_PUBLIC_URL || "http://localhost:4025"}/api/reports/networks/cms-auth/callback`;

  return { clientId, clientSecret, redirectUri };
}

function assertOAuthConfig() {
  const config = getOAuthConfig();

  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    const missing = [];
    if (!config.clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!config.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (!config.redirectUri) missing.push("GOOGLE_OAUTH_REDIRECT_URI");
    throw new Error(`Missing Google OAuth config: ${missing.join(", ")}`);
  }

  return config;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signState(payload) {
  const secret = process.env.JWT_SECRET || process.env.BACKEND_API_KEY || "cms-auth-state";
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createState(networkId) {
  const payload = base64UrlEncode(
    JSON.stringify({
      network_id: Number(networkId),
      nonce: crypto.randomBytes(12).toString("hex"),
      ts: Date.now()
    })
  );
  return `${payload}.${signState(payload)}`;
}

function parseState(state) {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature || signState(payload) !== signature) {
    throw new Error("Invalid OAuth state");
  }

  const parsed = JSON.parse(base64UrlDecode(payload));
  if (!parsed.network_id) throw new Error("Invalid network in OAuth state");
  if (Date.now() - Number(parsed.ts || 0) > 15 * 60 * 1000) {
    throw new Error("OAuth state expired");
  }

  return parsed;
}

function buildAuthUrl(networkId) {
  const { clientId, redirectUri } = assertOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CMS_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: createState(networkId)
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = assertOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const response = await axios.post(GOOGLE_TOKEN_URL, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000
  });

  return response.data;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = assertOAuthConfig();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token"
  });

  const response = await axios.post(GOOGLE_TOKEN_URL, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000
  });

  return response.data;
}

async function getGoogleUser(accessToken) {
  const response = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000
  });

  return response.data;
}

module.exports = {
  CMS_SCOPES,
  buildAuthUrl,
  parseState,
  exchangeCode,
  refreshAccessToken,
  getGoogleUser
};
