const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const db = require("../config/database");
const { getChannelFromYoutube, getChannelsFromYoutube, getQuotaStatus } = require("../services/youtubeService");
const { generateGroupReconciliationExcel } = require("../services/reconciliationTemplateService");
const cmsAuthService = require("../services/googleCmsAuthService");
const { normalizedRoles } = require("../middlewares/authMiddleware");

function decodeXml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function unzipXlsx(buffer) {
  const files = {};
  let offset = 0;

  while (offset < buffer.length - 30) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buffer.slice(nameStart, nameStart + fileNameLength).toString("utf8");
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);

    if (compressedSize > 0 && !name.endsWith("/")) {
      files[name] = method === 8 ? zlib.inflateRawSync(compressed).toString("utf8") : compressed.toString("utf8");
    }

    offset = dataStart + compressedSize;
  }

  return files;
}

function parseSharedStrings(xml = "") {
  return [...xml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) => {
    const pieces = [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1]));
    return pieces.join("");
  });
}

function columnIndex(cellRef = "") {
  const letters = String(cellRef).replace(/[0-9]/g, "");
  let index = 0;

  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return index - 1;
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  const rowMatches = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];

  for (const rowMatch of rowMatches) {
    const cells = [];
    const cellMatches = [...rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)];

    for (const cellMatch of cellMatches) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\sr="([^"]+)"/)?.[1] || "";
      const type = attrs.match(/\st="([^"]+)"/)?.[1] || "";
      const index = columnIndex(ref);
      let value = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] || "";

      if (type === "s") value = sharedStrings[Number(value)] || "";
      if (type === "inlineStr") value = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || "";

      cells[index] = decodeXml(value).trim();
    }

    rows.push(cells);
  }

  return rows.filter((row) => row.some((cell) => String(cell || "").trim()));
}

function parseCsv(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim()))
    .filter((row) => row.some(Boolean));
}

function parseImportFile(fileBase64, fileName = "") {
  const buffer = Buffer.from(fileBase64, "base64");

  if (fileName.toLowerCase().endsWith(".csv")) {
    return parseCsv(buffer.toString("utf8"));
  }

  const files = unzipXlsx(buffer);
  const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"] || "");
  const sheetName = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));

  if (!sheetName) {
    throw new Error("Không đọc được sheet trong file Excel");
  }

  return parseSheet(files[sheetName], sharedStrings);
}

function normalizeChannelId(value) {
  let input = String(value || "").trim();

  if (!input) return "";

  const channelMatch = input.match(/youtube\.com\/channel\/([^/?&#]+)/i);
  if (channelMatch) input = channelMatch[1];

  input = input.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "");

  if (!input) return "";
  return input.startsWith("UC") ? input : `UC${input}`;
}

function parseChannelInputs(value) {
  return String(value || "")
    .split(/[\n,;\s]+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => {
      const handleMatch = item.match(/youtube\.com\/@([^/?&#]+)/i);
      if (handleMatch) return `@${handleMatch[1]}`;
      if (item.startsWith("@")) return item;
      return normalizeChannelId(item);
    })
    .filter(Boolean);
}

function chunkItems(items = [], size = 500) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function existingReportChannelIds(channelIds = []) {
  const found = new Set();
  for (const batch of chunkItems(channelIds)) {
    if (!batch.length) continue;
    const rows = db.prepare(`
      SELECT channel_id
      FROM channels
      WHERE channel_id IN (${batch.map(() => "?").join(",")})
    `).all(...batch);
    rows.forEach((row) => found.add(row.channel_id));
  }
  return found;
}

function managedChannelRowsByIds(channelIds = []) {
  const rows = [];
  for (const batch of chunkItems(channelIds)) {
    if (!batch.length) continue;
    rows.push(...db.prepare(`
      SELECT mc.*, rs.share_rate AS revenue_share_rate
      FROM managed_channels mc
      LEFT JOIN revenue_sharings rs ON rs.id = mc.revenue_sharing_id
      WHERE mc.channel_id IN (${batch.map(() => "?").join(",")})
    `).all(...batch));
  }
  return rows;
}

function existingGroupChannelRows(groupId, channelIds = []) {
  const rows = [];
  for (const batch of chunkItems(channelIds)) {
    if (!batch.length) continue;
    rows.push(...db.prepare(`
      SELECT gc.channel_id, c.title
      FROM group_channels gc
      LEFT JOIN channels c ON c.channel_id = gc.channel_id
      WHERE gc.group_id = ? AND gc.channel_id IN (${batch.map(() => "?").join(",")})
    `).all(groupId, ...batch));
  }
  return rows;
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const clean = String(value || "").replace(/[^0-9.-]/g, "");
  const parsed = Number(clean || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeaderCell(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findHeaderIndex(header, matcher) {
  return header.findIndex((cell) => matcher(normalizeHeaderCell(cell)));
}

function normalizeRows(rows) {
  if (!rows.length) return [];

  const header = rows[0].map((cell) => String(cell || ""));
  let channelIndex = findHeaderIndex(header, (cell) => cell.includes("channel") && cell.includes("id"));
  let revenueIndex = findHeaderIndex(header, (cell) =>
    cell === "revenue" ||
    cell.includes("total revenue") ||
    cell.includes("gross revenue") ||
    cell.includes("doanh")
  );
  if (revenueIndex < 0) {
    revenueIndex = findHeaderIndex(header, (cell) => cell.includes("revenue") || cell.includes("doanh"));
  }
  const revenueUsIndex = findHeaderIndex(header, (cell) =>
    cell.includes("revenue us") || cell.includes("us revenue") || cell.includes("revenue usa")
  );
  const revenueBrIndex = findHeaderIndex(header, (cell) =>
    cell.includes("revenue br") || cell.includes("br revenue") || cell.includes("revenue brazil") || cell.includes("brazil revenue")
  );
  const dataRows = channelIndex >= 0 && revenueIndex >= 0 ? rows.slice(1) : rows;

  if (channelIndex < 0) channelIndex = 0;
  if (revenueIndex < 0) revenueIndex = 1;

  const totals = new Map();

  for (const row of dataRows) {
    const channelId = normalizeChannelId(row[channelIndex]);
    const revenue = parseMoney(row[revenueIndex]);
    const revenueUs = revenueUsIndex >= 0 ? parseMoney(row[revenueUsIndex]) : 0;
    const revenueBr = revenueBrIndex >= 0 ? parseMoney(row[revenueBrIndex]) : 0;

    if (channelId) {
      const current = totals.get(channelId) || {
        revenue: 0,
        revenue_us: 0,
        revenue_br: 0
      };
      current.revenue += revenue;
      current.revenue_us += revenueUs;
      current.revenue_br += revenueBr;
      totals.set(channelId, current);
    }
  }

  return [...totals.entries()].map(([channel_id, values]) => ({ channel_id, ...values }));
}

function parseChannel(row) {
  if (!row) return row;

  try {
    return { ...row, latest_videos: JSON.parse(row.latest_videos || "[]") };
  } catch {
    return { ...row, latest_videos: [] };
  }
}

function upsertChannel(data) {
  const existing = db.prepare("SELECT latest_videos FROM channels WHERE channel_id = ?").get(data.channel_id);
  const latestVideos = data.latest_videos === undefined
    ? (existing?.latest_videos || "[]")
    : JSON.stringify(data.latest_videos || []);

  db.prepare(`
    INSERT INTO channels (
      channel_id, title, description, custom_url, thumbnail, view_count,
      subscriber_count, video_count, country, published_at, latest_videos,
      status, status_error, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(channel_id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      custom_url = excluded.custom_url,
      thumbnail = excluded.thumbnail,
      view_count = excluded.view_count,
      subscriber_count = excluded.subscriber_count,
      video_count = excluded.video_count,
      country = excluded.country,
      published_at = excluded.published_at,
      latest_videos = excluded.latest_videos,
      status = excluded.status,
      status_error = excluded.status_error,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    data.channel_id,
    data.title,
    data.description,
    data.custom_url,
    data.thumbnail,
    data.view_count,
    data.subscriber_count,
    data.video_count,
    data.country,
    data.published_at,
    latestVideos,
    "active",
    null
  );
}

function upsertPlaceholderChannel(channelId, reason = "Không lấy được dữ liệu từ YouTube") {
  if (!channelId) return;

  const existing = db.prepare("SELECT * FROM channels WHERE channel_id = ?").get(channelId);
  if (existing && (existing.thumbnail || Number(existing.view_count || 0) > 0)) {
    db.prepare("UPDATE channels SET updated_at = CURRENT_TIMESTAMP WHERE channel_id = ?").run(channelId);
    return;
  }

  db.prepare(`
    INSERT INTO channels (
      channel_id,
      title,
      description,
      custom_url,
      thumbnail,
      view_count,
      subscriber_count,
      video_count,
      country,
      published_at,
      latest_videos,
      status,
      status_error,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(channel_id) DO UPDATE SET
      status = excluded.status,
      status_error = excluded.status_error,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    channelId,
    "Channel lỗi / die",
    "",
    "",
    "",
    0,
    0,
    0,
    "",
    "",
    "[]",
    "error",
    reason
  );
}

function getCurrentChannelNetwork(channelId, startMonth = "") {
  if (!channelId) return null;

  if (startMonth) {
    return db.prepare(`
      SELECT h.*, n.name AS network_name
      FROM channel_network_history h
      JOIN networks n ON n.id = h.new_network_id
      WHERE h.channel_id = ? AND h.start_month <= ?
      ORDER BY h.start_month DESC, h.id DESC
      LIMIT 1
    `).get(channelId, startMonth);
  }

  return db.prepare(`
    SELECT h.*, n.name AS network_name
    FROM channel_network_history h
    JOIN networks n ON n.id = h.new_network_id
    WHERE h.channel_id = ?
    ORDER BY h.start_month DESC, h.id DESC
    LIMIT 1
  `).get(channelId);
}

function seedChannelNetwork(channelId, networkId, month) {
  const existing = getCurrentChannelNetwork(channelId, month);

  if (existing) return;

  db.prepare(`
    INSERT INTO channel_network_history (channel_id, old_network_id, new_network_id, start_month, note)
    VALUES (?, NULL, ?, ?, ?)
  `).run(channelId, networkId, month, "Initial network from report import");
}

function parseGroup(row) {
  if (!row) return row;

  try {
    return { ...row, tiers: JSON.parse(row.tiers || "[]") };
  } catch {
    return { ...row, tiers: [] };
  }
}

function tierRate(tiers, revenue) {
  const match = [...(tiers || [])]
    .sort((a, b) => Number(a.min || 0) - Number(b.min || 0))
    .find((tier) => revenue >= Number(tier.min || 0) && revenue <= Number(tier.max || Number.MAX_SAFE_INTEGER));

  return match ? Number(match.rate || 0) : 0;
}

function normalizeCurrency(value) {
  const currency = String(value || "USD").toUpperCase();
  return ["USD", "VND", "GBP"].includes(currency) ? currency : "USD";
}

function getExchangeRate(month = "") {
  if (!month) return null;
  return db.prepare("SELECT * FROM exchange_rates WHERE month = ?").get(month) || null;
}

function exchangeFactor(currency = "USD", month = "") {
  const normalized = String(currency || "USD").toUpperCase();
  if (normalized === "USD") return { factor: 1, rate: null, missing: false };

  const rate = getExchangeRate(month);
  if (normalized === "VND") {
    const factor = Number(rate?.usd_to_vnd || 0);
    return { factor: factor || 1, rate, missing: !factor };
  }

  if (normalized === "GBP") {
    const factor = Number(rate?.usd_to_gbp || 0);
    return { factor: factor || 1, rate, missing: !factor };
  }

  return { factor: 1, rate: null, missing: false };
}

function groupRevenueTotal(groupId, month = "", currency = "USD") {
  const group = db.prepare("SELECT apply_revenue_tax FROM channel_groups WHERE id = ?").get(groupId);
  const appliesRevenueTax = Number(group?.apply_revenue_tax || 0) === 1;
  const row = db.prepare(`
    SELECT COALESCE(SUM(${appliesRevenueTax ? "(cr.revenue - cr.revenue_us * 0.3 - cr.revenue_br * 0.14)" : "cr.revenue"}), 0) AS total_revenue
    FROM group_channels gc
    LEFT JOIN (
      SELECT channel_id, month, SUM(revenue) AS revenue, SUM(revenue_us) AS revenue_us, SUM(revenue_br) AS revenue_br
      FROM channel_revenues
      WHERE month = ?
      GROUP BY channel_id, month
    ) cr ON cr.channel_id = gc.channel_id
    WHERE gc.group_id = ?
  `).get(month || "", groupId);

  return Number(row?.total_revenue || 0) * exchangeFactor(currency, month).factor;
}

function groupDefaultShare(groupId, month = "") {
  const group = parseGroup(db.prepare("SELECT * FROM channel_groups WHERE id = ?").get(groupId));
  if (!group) return 0;
  return tierRate(group.tiers, groupRevenueTotal(groupId, month, group.currency));
}

function existingShareForChannel(channelId, month = "", excludeGroupId = null) {
  const rows = db.prepare(`
    SELECT gc.group_id, gc.custom_share
    FROM group_channels gc
    WHERE gc.channel_id = ?
      AND (? IS NULL OR gc.group_id != ?)
  `).all(channelId, excludeGroupId, excludeGroupId);

  return rows.reduce((sum, row) => {
    const rate = row.custom_share == null || row.custom_share === ""
      ? groupDefaultShare(row.group_id, month)
      : Number(row.custom_share || 0);
    return sum + rate;
  }, 0);
}

function groupDetail(groupId, month) {
  const group = parseGroup(db.prepare(`
    SELECT g.*, p.partner_name, p.display_name, p.email, p.contact_name, p.phone,
           p.counter_email, p.address, p.pingpongx, p.bank_name, p.account_number, p.internal_notes
    FROM channel_groups g
    JOIN partners p ON p.id = g.partner_id
    WHERE g.id = ?
  `).get(groupId));

  if (!group) return null;

  const conversion = exchangeFactor(group.currency, month);
  const appliesRevenueTax = Number(group.apply_revenue_tax || 0) === 1;
  const channels = db.prepare(`
    SELECT gc.id AS group_channel_id, gc.custom_share, gc.channel_id AS group_channel_ref,
           c.*, COALESCE(cr.revenue, 0) AS revenue,
           COALESCE(cr.revenue_us, 0) AS revenue_us,
           COALESCE(cr.revenue_br, 0) AS revenue_br,
           COALESCE(NULLIF(cr.network_name, ''), mn.name, '-') AS network_name
    FROM group_channels gc
    LEFT JOIN channels c ON c.channel_id = gc.channel_id
    LEFT JOIN managed_channels mc ON mc.channel_id = gc.channel_id
    LEFT JOIN networks mn ON mn.id = mc.network_id
    LEFT JOIN (
      SELECT
        cr.channel_id,
        cr.month,
        SUM(cr.revenue) AS revenue,
        SUM(cr.revenue_us) AS revenue_us,
        SUM(cr.revenue_br) AS revenue_br,
        GROUP_CONCAT(DISTINCT COALESCE(n.name, '-')) AS network_name
      FROM channel_revenues cr
      LEFT JOIN networks n ON n.id = cr.network_id
      GROUP BY cr.channel_id, cr.month
    ) cr ON cr.channel_id = gc.channel_id AND cr.month = ?
    WHERE gc.group_id = ?
    ORDER BY c.title COLLATE NOCASE, gc.channel_id
  `).all(month || "", groupId).map((row) => {
    const rate = row.custom_share == null || row.custom_share === "" ? null : Number(row.custom_share);
    const revenueUsd = Number(row.revenue || 0);
    return {
      ...parseChannel(row),
      channel_id: row.channel_id || row.group_channel_ref,
      title: row.title || "Channel lỗi / die",
      status: row.status || "error",
      status_error: row.status_error || "Không lấy được dữ liệu từ YouTube",
      network_name: row.network_name || "-",
      revenue_us: Number(row.revenue_us || 0),
      revenue_br: Number(row.revenue_br || 0),
      revenue_usd: revenueUsd,
      revenue: revenueUsd * conversion.factor,
      applied_share: rate
    };
  });

  const totalRevenueUsd = channels.reduce((sum, channel) => sum + Number(channel.revenue_usd || 0), 0);
  const totalShareBaseUsd = channels.reduce((sum, channel) => {
    const revenueUsd = Number(channel.revenue_usd || 0);
    if (!appliesRevenueTax) return sum + revenueUsd;
    return sum + revenueUsd - Number(channel.revenue_us || 0) * 0.3 - Number(channel.revenue_br || 0) * 0.14;
  }, 0);
  const totalRevenueConverted = totalRevenueUsd * conversion.factor;
  const defaultRate = tierRate(group.tiers, totalShareBaseUsd * conversion.factor);
  const channelRows = channels.map((channel) => {
    const rate = channel.applied_share == null ? defaultRate : channel.applied_share;
    const revenueUsd = Number(channel.revenue_usd || 0);
    const taxUs = appliesRevenueTax ? Number(channel.revenue_us || 0) * 0.3 : 0;
    const taxBr = appliesRevenueTax ? Number(channel.revenue_br || 0) * 0.14 : 0;
    const shareBaseUsd = revenueUsd - taxUs - taxBr;
    const shareAmountUsd = shareBaseUsd * rate / 100;
    return {
      ...channel,
      applied_share: rate,
      revenue: revenueUsd,
      revenue_converted: revenueUsd * conversion.factor,
      tax_us: taxUs,
      tax_br: taxBr,
      total_tax_usd: taxUs + taxBr,
      share_base_usd: shareBaseUsd,
      share_base_converted: shareBaseUsd * conversion.factor,
      share_amount: shareAmountUsd,
      share_amount_converted: shareAmountUsd * conversion.factor,
      paid: shareAmountUsd * conversion.factor
    };
  });
  const paidUsd = channelRows.reduce((sum, channel) => sum + channel.share_amount, 0);
  const paidConverted = paidUsd * conversion.factor;
  const feeRate = Number(group.fee_rate || 0);
  const feeUsd = paidUsd * feeRate / 100;
  const feeConverted = paidConverted * feeRate / 100;
  const payableUsd = paidUsd - feeUsd;
  const payableConverted = paidConverted - feeConverted;
  const remainingUsd = totalRevenueUsd - paidUsd;
  const remainingConverted = totalRevenueConverted - paidConverted;

  return {
    ...group,
    month,
    exchange_rate: {
      month,
      currency: group.currency,
      factor: conversion.factor,
      missing: conversion.missing,
      usd_to_vnd: conversion.rate?.usd_to_vnd || 0,
      usd_to_gbp: conversion.rate?.usd_to_gbp || 0,
      description: group.currency === "VND"
        ? conversion.rate?.usd_to_vnd_description || ""
        : group.currency === "GBP"
          ? conversion.rate?.usd_to_gbp_description || ""
          : ""
    },
    channels: channelRows,
    summary: {
      total_revenue: totalRevenueUsd,
      total_revenue_usd: totalRevenueUsd,
      total_revenue_converted: totalRevenueConverted,
      revenue_us: channels.reduce((sum, channel) => sum + Number(channel.revenue_us || 0), 0),
      revenue_br: channels.reduce((sum, channel) => sum + Number(channel.revenue_br || 0), 0),
      apply_revenue_tax: appliesRevenueTax ? 1 : 0,
      tax_us: channelRows.reduce((sum, channel) => sum + Number(channel.tax_us || 0), 0),
      tax_br: channelRows.reduce((sum, channel) => sum + Number(channel.tax_br || 0), 0),
      total_tax_usd: channelRows.reduce((sum, channel) => sum + Number(channel.total_tax_usd || 0), 0),
      share_base_usd: channelRows.reduce((sum, channel) => sum + Number(channel.share_base_usd ?? channel.revenue_usd ?? 0), 0),
      paid: paidUsd,
      paid_usd: paidUsd,
      paid_converted: paidConverted,
      fee_rate: feeRate,
      fee_usd: feeUsd,
      fee_converted: feeConverted,
      payable_usd: payableUsd,
      payable_converted: payableConverted,
      remaining: remainingUsd,
      remaining_usd: remainingUsd,
      remaining_converted: remainingConverted,
      channels: channelRows.length,
      rows: channelRows.filter((channel) => Number(channel.revenue_usd || 0) > 0).length,
      default_rate: defaultRate
    }
  };
}

function isPartnerUser(user) {
  const roles = normalizedRoles(user?.roles?.length ? user.roles : user?.role);
  const isAdminRole = roles.includes("admin") || roles.includes("super admin") || roles.includes("supper admin");
  return roles.includes("partner") && !isAdminRole;
}

function partnerGroupIds(userId) {
  return db.prepare("SELECT group_id FROM user_group_permissions WHERE user_id = ?")
    .all(userId)
    .map((row) => Number(row.group_id));
}

function canUserReadGroup(user, groupId) {
  if (!isPartnerUser(user)) return true;
  return Boolean(db.prepare(`
    SELECT 1
    FROM user_group_permissions
    WHERE user_id = ? AND group_id = ?
  `).get(user.id, groupId));
}

function moneyText(value, currency = "USD") {
  const normalized = String(currency || "USD").toUpperCase();
  return new Intl.NumberFormat(normalized === "VND" ? "vi-VN" : normalized === "GBP" ? "en-GB" : "en-US", {
    style: "currency",
    currency: normalized,
    maximumFractionDigits: normalized === "VND" ? 0 : 2
  }).format(Number(value || 0));
}

function monthTitle(month = "") {
  if (!/^\d{4}-\d{2}$/.test(month)) return month || "";
  const [year, monthValue] = month.split("-").map(Number);
  return new Date(year, monthValue - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function safeFileName(value = "export") {
  return String(value || "export").replace(/[\\/:*?"<>|]+/g, "-").trim() || "export";
}

function safeDownloadName(value = "export") {
  const fallback = "export";
  return String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]+/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || fallback;
}

function setDownloadHeaders(res, contentType, fileName) {
  const safeName = safeDownloadName(fileName);
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
}

function selectedCompany(companyId) {
  if (companyId) {
    const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId);
    if (row) return row;
  }

  return db.prepare("SELECT * FROM companies ORDER BY updated_at DESC, id DESC LIMIT 1").get() || {
    company_name: "OHENE MEDIA SYSTEMS UK LTD",
    email: "Admin@amnhacso.com",
    phone: "(+44) 744 64 64 679",
    address: "2A Connaught Avenue, London, England, E4 7AA",
    representative_name: "Nguyen Van Tan",
    representative_position: "Director",
    bank_name: "",
    account_number: ""
  };
}

function addThinBorder(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFB8C7DC" } },
    left: { style: "thin", color: { argb: "FFB8C7DC" } },
    bottom: { style: "thin", color: { argb: "FFB8C7DC" } },
    right: { style: "thin", color: { argb: "FFB8C7DC" } }
  };
}

function styleRange(ws, range, style = {}) {
  const [start, end] = range.split(":");
  const startCell = ws.getCell(start);
  const endCell = ws.getCell(end || start);
  for (let row = startCell.row; row <= endCell.row; row += 1) {
    for (let col = startCell.col; col <= endCell.col; col += 1) {
      const cell = ws.getCell(row, col);
      addThinBorder(cell);
      Object.assign(cell, style);
      if (style.alignment) cell.alignment = { ...style.alignment };
      if (style.font) cell.font = { ...style.font };
      if (style.fill) cell.fill = { ...style.fill };
      if (style.numFmt) cell.numFmt = style.numFmt;
    }
  }
}

function setCell(ws, address, value, style = {}) {
  const cell = ws.getCell(address);
  cell.value = value;
  addThinBorder(cell);
  Object.assign(cell, style);
  if (style.alignment) cell.alignment = { ...style.alignment };
  if (style.font) cell.font = { ...style.font };
  if (style.fill) cell.fill = { ...style.fill };
  if (style.numFmt) cell.numFmt = style.numFmt;
  return cell;
}

function buildReconciliationWorkbook(detail, company) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANS Network";
  workbook.created = new Date();
  const ws = workbook.addWorksheet((detail.partner_name || detail.group_name || "Invoice").slice(0, 31), {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: true, zoomScale: 90 }]
  });

  ws.columns = [
    { width: 8 },
    { width: 44 },
    { width: 72 },
    { width: 20 },
    { width: 60 },
    { width: 14 },
    { width: 42 },
    { width: 28 },
    { width: 14 }
  ];

  const baseFont = { name: "Calibri", size: 10 };
  const bold = { ...baseFont, bold: true };
  const title = { ...baseFont, size: 16, bold: true };
  const partyFont = { ...baseFont, bold: true, color: { argb: "FF1F4E79" } };
  const blueFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1FB" } };
  const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F8FF" } };
  const center = { horizontal: "center", vertical: "middle" };
  const right = { horizontal: "right", vertical: "middle" };
  const wrap = { vertical: "middle", wrapText: true };
  const currency = detail.currency || "USD";
  const paidFormat = currency === "VND" ? "#,##0" : "#,##0.00";
  const factor = Number(detail.exchange_rate?.factor || 1);

  ["A1:I1", "A2:I2", "A3:I3", "A4:I4", "A6:I6", "B7:I7", "B8:I8", "B9:F9", "G9:I9", "A10:I10", "B11:I11", "B13:I13", "B14:I14", "E15:I15"].forEach((range) => ws.mergeCells(range));

  setCell(ws, "A1", "SOCIALIST REPUBLIC OF VIETNAM", { font: bold, alignment: center });
  setCell(ws, "A2", "Independence - Freedom - Happiness", { font: baseFont, alignment: center });
  setCell(ws, "A3", "----- o0o -----", { font: baseFont, alignment: center });
  setCell(ws, "A4", `YOUTUBE RECONCILIATION MINUTES ${monthTitle(detail.month)}`, { font: title, alignment: center });
  setCell(ws, "A6", `Party A: ${company.company_name || "-"}`, { font: partyFont, fill: blueFill });
  setCell(ws, "A7", "Address", { font: bold });
  setCell(ws, "B7", company.address || "-", { font: baseFont, alignment: wrap });
  setCell(ws, "A8", "Phone / Email", { font: bold });
  setCell(ws, "B8", `${company.phone || "-"} / ${company.email || "-"}`, { font: baseFont, alignment: wrap });
  setCell(ws, "A9", "Representative", { font: bold });
  setCell(ws, "B9", company.representative_name || "-", { font: baseFont });
  setCell(ws, "G9", `Position: ${company.representative_position || "-"}`, { font: baseFont });

  setCell(ws, "A10", `Party B: ${detail.partner_name || "-"}`, { font: partyFont, fill: blueFill });
  setCell(ws, "A11", "Address", { font: bold });
  setCell(ws, "B11", detail.address || "-", { font: baseFont, alignment: wrap });
  setCell(ws, "A12", "Phone", { font: bold });
  setCell(ws, "I12", detail.phone || "-", { font: baseFont, alignment: right });
  setCell(ws, "A13", "Email", { font: bold });
  setCell(ws, "B13", detail.email || "-", { font: baseFont });
  setCell(ws, "A14", "Bank details", { font: bold });
  setCell(ws, "B14", `- | Account: ${detail.account_number || "-"} | PingPongX: ${detail.pingpongx || "-"} | Counter: ${detail.counter_email || detail.email || "-"}`, { font: baseFont, alignment: wrap });
  setCell(ws, "A15", "Exchange month description", { font: bold });
  setCell(ws, "E15", `1 USD = ${factor.toLocaleString("en-US", { maximumFractionDigits: currency === "VND" ? 0 : 2 })} ${currency}`, { font: baseFont });

  const headers = ["No.", "Channel Name", "Channel ID", "Network", "Total Channel Revenue (USD)", "Share", "Share Amount USD", `Paid ${currency}`, "Notes"];
  headers.forEach((header, index) => {
    const cell = ws.getCell(16, index + 1);
    cell.value = header;
    cell.font = bold;
    cell.alignment = center;
    addThinBorder(cell);
  });

  let rowIndex = 17;
  detail.channels.forEach((channel, index) => {
    const values = [
      index + 1,
      channel.title || "Channel error / die",
      channel.channel_id || "",
      channel.network_name || "-",
      Number(channel.revenue_usd || 0),
      `${Number(channel.applied_share || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`,
      Number(channel.share_amount || 0),
      Number(channel.paid ?? channel.share_amount_converted ?? 0),
      ""
    ];
    values.forEach((value, colIndex) => {
      const cell = ws.getCell(rowIndex, colIndex + 1);
      cell.value = value;
      cell.font = baseFont;
      cell.alignment = colIndex === 0 || colIndex >= 4 ? right : wrap;
      if ([4, 6].includes(colIndex)) cell.numFmt = "#,##0.00";
      if (colIndex === 7) cell.numFmt = paidFormat;
      addThinBorder(cell);
    });
    rowIndex += 1;
  });

  const totalRow = rowIndex;
  ws.mergeCells(`A${totalRow}:D${totalRow}`);
  setCell(ws, `A${totalRow}`, "Total", { font: bold, fill: totalFill });
  setCell(ws, `E${totalRow}`, Number(detail.summary.total_revenue_usd || 0), { font: bold, fill: totalFill, alignment: right, numFmt: "#,##0.00" });
  setCell(ws, `G${totalRow}`, Number(detail.summary.paid_usd || 0), { font: bold, fill: totalFill, alignment: right, numFmt: "#,##0.00" });
  setCell(ws, `H${totalRow}`, Number(detail.summary.paid_converted || 0), { font: bold, fill: totalFill, alignment: right, numFmt: paidFormat });
  styleRange(ws, `A${totalRow}:I${totalRow}`, { fill: totalFill });

  const feeRow = totalRow + 1;
  ws.mergeCells(`A${feeRow}:G${feeRow}`);
  setCell(ws, `A${feeRow}`, `Fee (${Number(detail.summary.fee_rate || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}%)`, { font: bold, fill: totalFill });
  setCell(ws, `H${feeRow}`, Number(detail.summary.fee_converted || 0), { font: bold, fill: totalFill, alignment: right, numFmt: paidFormat });
  styleRange(ws, `A${feeRow}:I${feeRow}`, { fill: totalFill });

  const payableRow = feeRow + 1;
  ws.mergeCells(`A${payableRow}:G${payableRow}`);
  setCell(ws, `A${payableRow}`, `Total Payable ${currency}`, { font: bold, fill: totalFill });
  setCell(ws, `H${payableRow}`, Number(detail.summary.payable_converted || 0), { font: bold, fill: totalFill, alignment: right, numFmt: paidFormat });
  styleRange(ws, `A${payableRow}:I${payableRow}`, { fill: totalFill });

  for (let row = 1; row <= payableRow; row += 1) {
    for (let col = 1; col <= 9; col += 1) {
      const cell = ws.getCell(row, col);
      cell.font = cell.font || baseFont;
      addThinBorder(cell);
    }
  }

  ws.getRow(4).height = 24;
  ws.getRow(16).height = 20;
  ws.pageSetup.printArea = `A1:I${payableRow}`;
  return workbook;
}

async function sendExcelExport(res, detail, company, options = {}) {
  const buffer = await generateGroupReconciliationExcel(detail, company, options);
  const fileName = `${safeFileName(detail.group_name || "group")}-${detail.month || "report"}.xlsx`;
  setDownloadHeaders(res, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
  res.send(buffer);
}

function dataUrlToImageBuffer(value = "") {
  const match = String(value).match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
}

function getUploadedPdfLogo() {
  const rows = db.prepare("SELECT key, value FROM system_settings WHERE key IN ('logo_mode', 'logo_data_url')").all();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  if (settings.logo_mode !== "upload" || !settings.logo_data_url) return null;
  return dataUrlToImageBuffer(settings.logo_data_url);
}

async function sendPdfExport(res, detail, company, options = {}) {
  const currency = detail.currency || "USD";
  const fileName = `${safeFileName(detail.group_name || "group")}-${detail.month || "invoice"}.pdf`;
  const includeSignatures = Boolean(options.includeSignatures);

  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const regularFontCandidates = [
    "C:\\Windows\\Fonts\\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
  ];
  const boldFontCandidates = [
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
  ];
  const regularFont = regularFontCandidates.find((fontPath) => fs.existsSync(fontPath)) || "Helvetica";
  const boldFont = boldFontCandidates.find((fontPath) => fs.existsSync(fontPath)) || "Helvetica-Bold";
  if (regularFont !== "Helvetica") doc.registerFont("AppRegular", regularFont);
  if (boldFont !== "Helvetica-Bold") doc.registerFont("AppBold", boldFont);
  const regular = regularFont === "Helvetica" ? "Helvetica" : "AppRegular";
  const boldPdf = boldFont === "Helvetica-Bold" ? "Helvetica-Bold" : "AppBold";

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 34;
  const contentW = pageW - margin * 2;
  const primary = "#1F8A5B";
  const primaryDark = "#11613E";
  const pale = "#EAF8EF";
  const pale2 = "#F6FCF8";
  const line = "#D6EADF";
  const dark = "#0F172A";
  const gray = "#64748B";
  const logoPath = path.resolve(__dirname, "../../templates/ans-logo.png");
  const uploadedLogo = getUploadedPdfLogo();

  function text(value) {
    return value == null || value === "" ? "-" : String(value);
  }

  function drawLogo(x, y, size) {
    doc.circle(x + size / 2, y + size / 2, size / 2).fill("white");
    doc.circle(x + size / 2, y + size / 2, size / 2).lineWidth(1).stroke(line);
    if (uploadedLogo) {
      doc.image(uploadedLogo, x + 6, y + 6, { fit: [size - 12, size - 12], align: "center", valign: "center" });
    } else if (fs.existsSync(logoPath)) {
      doc.image(logoPath, x + 10, y + 10, { fit: [size - 20, size - 20], align: "center", valign: "center" });
    } else {
      doc.fillColor(primaryDark).font(boldPdf).fontSize(15).text("ANS", x, y + size / 2 - 9, { width: size, align: "center" });
    }
  }

  function footer() {
    const y = pageH - 34;
    doc.rect(0, y, pageW, 34).fill(pale);
    doc.fillColor(primaryDark).font(boldPdf).fontSize(8).text("ANS Network - YouTube Revenue Reconciliation", margin, y + 12);
    doc.fillColor(gray).font(regular).fontSize(8).text(`Page ${doc.bufferedPageRange().count || ""}`, pageW - margin - 60, y + 12, { width: 60, align: "right" });
  }

  function pageChrome() {
    doc.rect(0, 0, pageW, pageH).fill("white");
    doc.rect(0, 0, pageW, 96).fill(pale);
    doc.rect(0, 96, pageW, 2).fill("#CBEFD8");
    footer();
  }

  function field(label, value, x, y, width) {
    doc.fillColor(gray).font(boldPdf).fontSize(7).text(label.toUpperCase(), x, y, { width });
    doc.fillColor(dark).font(regular).fontSize(9).text(text(value), x, y + 12, { width, lineGap: 2 });
  }

  function card(x, y, w, h, title, rows) {
    doc.roundedRect(x, y, w, h, 12).fillAndStroke(pale2, line);
    doc.fillColor(primaryDark).font(boldPdf).fontSize(10).text(title.toUpperCase(), x + 14, y + 13, { width: w - 28 });
    let rowY = y + 34;
    rows.forEach((row) => {
      field(row.label, row.value, x + 14, rowY, w - 28);
      rowY += row.height || 35;
    });
  }

  function singleLine(value, maxLength = 38) {
    const clean = text(value).replace(/\s+/g, " ").trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}...` : clean;
  }

  function summaryBox(x, y, w, label, value, subValue, fill = "white") {
    doc.roundedRect(x, y, w, 58, 10).fillAndStroke(fill, line);
    doc.fillColor(gray).font(boldPdf).fontSize(7).text(label.toUpperCase(), x + 12, y + 12, { width: w - 24 });
    doc.fillColor(label.includes("PAYABLE") ? primaryDark : dark).font(boldPdf).fontSize(13).text(value, x + 12, y + 28, { width: w - 24 });
    if (subValue) doc.fillColor(gray).font(regular).fontSize(8).text(subValue, x + 12, y + 44, { width: w - 24 });
  }

  function signatureCard(x, y, w, title) {
    doc.roundedRect(x, y, w, 104, 12).fillAndStroke("white", line);
    doc.fillColor(primaryDark).font(boldPdf).fontSize(10).text(title.toUpperCase(), x + 14, y + 14, { width: w - 28 });
    const rows = ["Sign", "Name", "Title"];
    rows.forEach((label, index) => {
      const rowY = y + 42 + index * 19;
      doc.fillColor(gray).font(boldPdf).fontSize(7).text(label.toUpperCase(), x + 14, rowY, { width: 50 });
      doc.moveTo(x + 68, rowY + 7).lineTo(x + w - 16, rowY + 7).lineWidth(0.7).stroke("#BFDCCB");
    });
  }

  function drawHeader() {
    pageChrome();
    drawLogo(margin, 24, 54);
    doc.fillColor(dark).font(boldPdf).fontSize(24).text("INVOICE", margin + 70, 26);
    doc.fillColor(gray).font(regular).fontSize(9).text("YouTube reconciliation minutes", margin + 72, 57);
    doc.fillColor(primaryDark).font(boldPdf).fontSize(11).text(monthTitle(detail.month), margin + 72, 72);

    doc.roundedRect(pageW - margin - 182, 24, 182, 54, 10).fillAndStroke("white", line);
    doc.fillColor(gray).font(boldPdf).fontSize(7).text("INVOICE NO.", pageW - margin - 168, 36);
    doc.fillColor(dark).font(boldPdf).fontSize(12).text(`${detail.month || "month"}-${detail.id}`, pageW - margin - 168, 50);
    doc.fillColor(gray).font(regular).fontSize(8).text(new Date().toLocaleDateString("en-GB"), pageW - margin - 168, 66);
  }

  function drawTableHeader(y) {
    const cols = [
      { label: "#", x: margin, w: 22, align: "center" },
      { label: "Channel", x: margin + 24, w: 142 },
      { label: "Network", x: margin + 170, w: 76 },
      { label: "Revenue USD", x: margin + 250, w: 72, align: "right" },
      { label: "Share", x: margin + 326, w: 38, align: "center" },
      { label: "Share USD", x: margin + 368, w: 68, align: "right" },
      { label: `Paid ${currency}`, x: margin + 440, w: contentW - 440, align: "right" }
    ];
    doc.roundedRect(margin, y, contentW, 26, 8).fill(primary);
    doc.fillColor("white").font(boldPdf).fontSize(7.5);
    cols.forEach((col) => doc.text(col.label, col.x + 4, y + 9, { width: col.w - 8, align: col.align || "left" }));
    return cols;
  }

  function addContentPage() {
    doc.addPage();
    pageChrome();
    doc.fillColor(primaryDark).font(boldPdf).fontSize(12).text("Channel revenue details", margin, 34);
    doc.fillColor(gray).font(regular).fontSize(9).text(`${text(detail.group_name)} - ${monthTitle(detail.month)}`, margin, 52);
    return drawTableHeader(82);
  }

  drawHeader();

  const topCardsY = 120;
  card(margin, topCardsY, (contentW - 14) / 2, 142, "Invoice From", [
    { label: "Company", value: company.company_name },
    { label: "Phone / Email", value: `${text(company.phone)} / ${text(company.email)}` },
    { label: "Address", value: company.address, height: 48 }
  ]);
  card(margin + (contentW + 14) / 2, topCardsY, (contentW - 14) / 2, 142, "Invoice To", [
    { label: "Partner", value: detail.partner_name || detail.display_name },
    { label: "Phone / Email", value: `${text(detail.phone)} / ${text(detail.email)}` },
    { label: "Address", value: detail.address, height: 48 }
  ]);

  const statsY = 282;
  summaryBox(margin, statsY, 122, "Total Revenue USD", moneyText(detail.summary.total_revenue_usd || 0, "USD"), moneyText(detail.summary.total_revenue_converted || 0, currency), pale2);
  summaryBox(margin + 134, statsY, 122, "Share Amount USD", moneyText(detail.summary.paid_usd || 0, "USD"), moneyText(detail.summary.paid_converted || 0, currency), pale2);
  summaryBox(margin + 268, statsY, 122, `Fee ${Number(detail.summary.fee_rate || 0)}%`, moneyText(detail.summary.fee_converted || 0, currency), moneyText(detail.summary.fee_usd || 0, "USD"), pale2);
  summaryBox(margin + 402, statsY, contentW - 402, `Payable ${currency}`, moneyText(detail.summary.payable_converted || 0, currency), moneyText(detail.summary.payable_usd || 0, "USD"), pale);

  doc.fillColor(dark).font(boldPdf).fontSize(12).text("Revenue Detail", margin, 368);
  let cols = drawTableHeader(392);
  let y = 424;

  detail.channels.forEach((channel, index) => {
    const note = channel.status === "error" ? channel.status_error || "Could not fetch YouTube data" : "";
    const channelTitle = singleLine(channel.title || "Channel error / die", 36);
    const channelId = singleLine(channel.channel_id || "", 34);
    const networkName = singleLine(channel.network_name || "-", 18);
    const rowHeight = note ? 48 : 38;
    if (y + rowHeight > pageH - 76) {
      cols = addContentPage();
      y = 116;
    }

    doc.roundedRect(margin, y, contentW, rowHeight, 8).fillAndStroke(index % 2 ? "white" : pale2, "#E4F3EA");
    doc.fillColor(dark).font(regular).fontSize(8);
    doc.text(String(index + 1), cols[0].x + 4, y + 11, { width: cols[0].w - 8, align: "center" });
    doc.font(boldPdf).text(channelTitle, cols[1].x + 4, y + 8, { width: cols[1].w - 8, lineBreak: false });
    doc.fillColor(primaryDark).font(regular).fontSize(7).text(channelId, cols[1].x + 4, y + 22, { width: cols[1].w - 8, lineBreak: false });
    if (note) doc.fillColor("#DC2626").fontSize(6.5).text(singleLine(note, 62), cols[1].x + 4, y + 34, { width: cols[1].w + cols[2].w, lineBreak: false });
    doc.fillColor(dark).font(regular).fontSize(8).text(networkName, cols[2].x + 4, y + 12, { width: cols[2].w - 8, lineBreak: false });
    doc.text(moneyText(channel.revenue_usd || 0, "USD"), cols[3].x + 4, y + 12, { width: cols[3].w - 8, align: "right" });
    doc.text(`${Number(channel.applied_share || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`, cols[4].x + 4, y + 12, { width: cols[4].w - 8, align: "center" });
    doc.text(moneyText(channel.share_amount || 0, "USD"), cols[5].x + 4, y + 12, { width: cols[5].w - 8, align: "right" });
    doc.font(boldPdf).fillColor(primaryDark).text(moneyText(channel.paid ?? channel.share_amount_converted ?? 0, currency), cols[6].x + 4, y + 12, { width: cols[6].w - 8, align: "right" });
    y += rowHeight + 6;
  });

  if (y + (includeSignatures ? 340 : 210) > pageH - 54) {
    doc.addPage();
    pageChrome();
    y = 56;
  } else {
    y += 8;
  }

  const totalsX = pageW - margin - 226;
  doc.roundedRect(totalsX, y, 226, 118, 12).fillAndStroke(pale2, line);
  const totalRows = [
    ["Subtotal", moneyText(detail.summary.paid_converted || 0, currency)],
    [`Fee (${Number(detail.summary.fee_rate || 0)}%)`, moneyText(detail.summary.fee_converted || 0, currency)],
    ["Advance", moneyText(0, currency)]
  ];
  totalRows.forEach((row, index) => {
    doc.fillColor(gray).font(boldPdf).fontSize(8).text(row[0], totalsX + 16, y + 16 + index * 22);
    doc.fillColor(dark).font(regular).fontSize(9).text(row[1], totalsX + 94, y + 16 + index * 22, { width: 112, align: "right" });
  });
  doc.roundedRect(totalsX + 12, y + 82, 202, 24, 8).fill(primary);
  doc.fillColor("white").font(boldPdf).fontSize(10).text("TOTAL PAYABLE", totalsX + 22, y + 90);
  doc.text(moneyText(detail.summary.payable_converted || 0, currency), totalsX + 104, y + 90, { width: 100, align: "right" });

  const payY = y + 142;
  const bankCardHeight = 142;
  card(margin, payY, (contentW - 14) / 2, bankCardHeight, "Company Bank Details", [
    { label: "Account Name", value: company.company_name, height: 38 },
    { label: "Account Number", value: company.account_number, height: 34 },
    { label: "Bank", value: company.bank_name, height: 44 }
  ]);
  card(margin + (contentW + 14) / 2, payY, (contentW - 14) / 2, bankCardHeight, "Partner Payment Details", [
    { label: "Account Name", value: detail.partner_name, height: 38 },
    { label: "Account Number", value: detail.account_number, height: 34 },
    { label: "Bank / PingPongX", value: detail.bank_name || detail.pingpongx, height: 44 }
  ]);

  let noteY = payY + bankCardHeight + 20;
  if (includeSignatures) {
    const signY = payY + bankCardHeight + 22;
    const signW = (contentW - 14) / 2;
    signatureCard(margin, signY, signW, "Company Signature");
    signatureCard(margin + signW + 14, signY, signW, "Partner Signature");
    noteY = signY + 124;
  }

  doc.fillColor(gray).font(regular).fontSize(8).text(
    "This invoice is generated from monthly YouTube revenue reconciliation data. Revenue USD, share amount USD, paid currency, exchange rate, and fee follow the same calculation rules as the Excel export.",
    margin,
    noteY,
    { width: contentW, align: "center" }
  );
  doc.end();

  const buffer = await finished;

  if (options.base64) {
    res.json({
      success: true,
      fileName,
      mimeType: "application/pdf",
      data: buffer.toString("base64")
    });
    return;
  }

  setDownloadHeaders(res, "application/pdf", fileName);
  res.send(buffer);
}

exports.importManagerReport = async (req, res) => {
  try {
    const { month, network_id, fileName, fileBase64 } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn tháng dạng YYYY-MM" });
    }

    if (!fileBase64) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn file report" });
    }

    const network = db.prepare("SELECT * FROM networks WHERE id = ?").get(network_id);

    if (!network) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn network" });
    }

    const rows = normalizeRows(parseImportFile(fileBase64, fileName));

    if (!rows.length) {
      return res.status(400).json({ success: false, message: "File không có dữ liệu channel/revenue hợp lệ" });
    }

    let youtubeChannels = [];
    let youtubeError = null;

    try {
      youtubeChannels = await getChannelsFromYoutube(rows.map((row) => row.channel_id), { includeLatest: false });
    } catch (error) {
      youtubeError = error;
    }

    const foundIds = new Set(youtubeChannels.map((channel) => channel.channel_id));
    const saveRevenue = db.prepare(`
      INSERT INTO channel_revenues (
        month, network_id, channel_id, revenue, revenue_us, revenue_br, source_file, import_id, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(month, network_id, channel_id) DO UPDATE SET
        revenue = excluded.revenue,
        revenue_us = excluded.revenue_us,
        revenue_br = excluded.revenue_br,
        source_file = excluded.source_file,
        import_id = excluded.import_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    const missingChannels = rows.filter((row) => !foundIds.has(row.channel_id)).map((row) => row.channel_id);
    const totalRevenue = rows.reduce((sum, row) => sum + safeNumber(row.revenue), 0);
    const totalRevenueUs = rows.reduce((sum, row) => sum + safeNumber(row.revenue_us), 0);
    const totalRevenueBr = rows.reduce((sum, row) => sum + safeNumber(row.revenue_br), 0);

    const transaction = db.transaction(() => {
      const importResult = db.prepare(`
        INSERT INTO report_imports (network_id, month, file_name, channel_count, total_revenue, missing_channels)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(network.id, month, fileName || "", rows.length, totalRevenue, JSON.stringify(missingChannels));
      const importId = importResult.lastInsertRowid;

      for (const channel of youtubeChannels) upsertChannel(channel);
      for (const channelId of missingChannels) {
        upsertPlaceholderChannel(
          channelId,
          youtubeError
            ? `YouTube sync skipped during import: ${youtubeError.message}`
            : "Không tìm thấy channel trên YouTube khi import report"
        );
      }
      for (const row of rows) {
        saveRevenue.run(
          month,
          network.id,
          row.channel_id,
          safeNumber(row.revenue),
          safeNumber(row.revenue_us),
          safeNumber(row.revenue_br),
          fileName || "",
          importId
        );
        seedChannelNetwork(row.channel_id, network.id, month);
      }

      return importId;
    });

    const importId = transaction();

    res.json({
      success: true,
      message: youtubeError
        ? "Report imported. YouTube channel sync was skipped because the API returned an error."
        : "Đã import report và cập nhật channel",
      data: {
        import_id: importId,
        month,
        network,
        rows: rows.length,
        updated_channels: youtubeChannels.length,
        missing_channels: missingChannels,
        youtube_error: youtubeError
          ? {
              message: youtubeError.message,
              details: youtubeError.youtube || null
            }
          : null,
        total_revenue: totalRevenue,
        total_revenue_us: totalRevenueUs,
        total_revenue_br: totalRevenueBr
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi import report", error: error.message });
  }
};

exports.getReportSummary = (req, res) => {
  try {
    const month = String(req.query.month || "");
    const monthFrom = String(req.query.month_from || month || "");
    const monthTo = String(req.query.month_to || month || "");
    const networkId = String(req.query.network_id || "");
    const rows = db.prepare(`
      SELECT cr.*, c.title, c.thumbnail, c.custom_url, n.name AS network_name
      FROM channel_revenues cr
      LEFT JOIN channels c ON c.channel_id = cr.channel_id
      LEFT JOIN networks n ON n.id = cr.network_id
      WHERE (? = '' OR cr.month >= ?)
        AND (? = '' OR cr.month <= ?)
        AND (? = '' OR cr.network_id = ?)
      ORDER BY cr.month DESC, n.name COLLATE NOCASE, cr.revenue DESC
    `).all(monthFrom, monthFrom, monthTo, monthTo, networkId, networkId);
    const history = db.prepare(`
      SELECT ri.*, n.name AS network_name
      FROM report_imports ri
      JOIN networks n ON n.id = ri.network_id
      WHERE (? = '' OR ri.month >= ?)
        AND (? = '' OR ri.month <= ?)
        AND (? = '' OR ri.network_id = ?)
      ORDER BY ri.imported_at DESC, ri.id DESC
    `).all(monthFrom, monthFrom, monthTo, monthTo, networkId, networkId).map((row) => {
      try {
        return { ...row, missing_channels: JSON.parse(row.missing_channels || "[]") };
      } catch {
        return { ...row, missing_channels: [] };
      }
    });

    res.json({
      success: true,
      data: {
        rows,
        history,
        total_rows: rows.length,
        total_revenue: rows.reduce((sum, row) => sum + safeNumber(row.revenue), 0),
        total_revenue_us: rows.reduce((sum, row) => sum + safeNumber(row.revenue_us), 0),
        total_revenue_br: rows.reduce((sum, row) => sum + safeNumber(row.revenue_br), 0)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy report", error: error.message });
  }
};

exports.deleteReportMonth = (req, res) => {
  try {
    const month = String(req.body.month || req.query.month || "");
    const networkId = String(req.body.network_id || req.query.network_id || "");

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn tháng dạng YYYY-MM" });
    }

    if (!networkId) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn network cần xóa import" });
    }

    const transaction = db.transaction(() => {
      const revenueResult = db.prepare("DELETE FROM channel_revenues WHERE month = ? AND network_id = ?").run(month, networkId);
      const historyResult = db.prepare("DELETE FROM report_imports WHERE month = ? AND network_id = ?").run(month, networkId);
      return {
        revenue_rows: revenueResult.changes,
        history_rows: historyResult.changes
      };
    });

    const result = transaction();
    res.json({ success: true, message: "Đã xóa import của tháng đã chọn", data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa import", error: error.message });
  }
};

exports.getYoutubeQuota = (req, res) => {
  try {
    res.json({ success: true, data: getQuotaStatus() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load YouTube quota", error: error.message });
  }
};

function dashboardGroupTotals(month = "") {
  const groups = db.prepare("SELECT id FROM channel_groups ORDER BY id ASC").all();
  const months = month
    ? [month]
    : db.prepare("SELECT DISTINCT month FROM channel_revenues ORDER BY month ASC").all().map((row) => row.month);

  const partnerMap = new Map();
  const networkPaidMap = new Map();
  const channelRevenueByNetwork = db.prepare(`
    SELECT COALESCE(n.name, '-') AS network_name, COALESCE(SUM(cr.revenue), 0) AS revenue_usd
    FROM channel_revenues cr
    LEFT JOIN networks n ON n.id = cr.network_id
    WHERE cr.month = ? AND cr.channel_id = ?
    GROUP BY cr.network_id, n.name
  `);
  let revenueUsd = 0;
  let paidUsd = 0;
  let feeUsd = 0;

  function addNetworkPaid(networkName, amount) {
    const key = String(networkName || "-").trim() || "-";
    networkPaidMap.set(key, (networkPaidMap.get(key) || 0) + Number(amount || 0));
  }

  for (const itemMonth of months) {
    for (const group of groups) {
      const detail = groupDetail(group.id, itemMonth);
      if (!detail) continue;

      const groupRevenue = Number(detail.summary?.total_revenue_usd || 0);
      const groupPaid = Number(detail.summary?.payable_usd || detail.summary?.paid_usd || 0);
      const groupFee = Number(detail.summary?.fee_usd || 0);

      revenueUsd += groupRevenue;
      paidUsd += groupPaid;
      feeUsd += groupFee;

      const feeMultiplier = Math.max(0, 1 - Number(detail.summary?.fee_rate || 0) / 100);
      for (const channel of detail.channels || []) {
        const channelShareUsd = Number(channel.share_amount || 0);
        if (!channel.channel_id || channelShareUsd <= 0) continue;

        const revenueRows = channelRevenueByNetwork.all(itemMonth, channel.channel_id)
          .map((row) => ({
            network_name: row.network_name || "-",
            revenue_usd: Number(row.revenue_usd || 0)
          }))
          .filter((row) => row.revenue_usd > 0);
        const channelRevenueTotal = revenueRows.reduce((sum, row) => sum + row.revenue_usd, 0);

        if (channelRevenueTotal > 0) {
          for (const row of revenueRows) {
            addNetworkPaid(row.network_name, channelShareUsd * (row.revenue_usd / channelRevenueTotal) * feeMultiplier);
          }
        } else {
          addNetworkPaid(channel.network_name || "-", channelShareUsd * feeMultiplier);
        }
      }

      const partnerId = detail.partner_id;
      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, {
          partner_id: partnerId,
          partner_name: detail.display_name || detail.partner_name || "-",
          group_id: detail.id,
          group_name: detail.group_name,
          best_group_revenue_usd: groupRevenue,
          revenue_usd: 0,
          paid_usd: 0,
          profit_usd: 0,
          channels: new Set()
        });
      }

      const partner = partnerMap.get(partnerId);
      if (groupRevenue > Number(partner.best_group_revenue_usd || 0)) {
        partner.group_id = detail.id;
        partner.group_name = detail.group_name;
        partner.best_group_revenue_usd = groupRevenue;
      }
      partner.revenue_usd += groupRevenue;
      partner.paid_usd += groupPaid;
      partner.profit_usd += groupRevenue - groupPaid;
      for (const channel of detail.channels || []) {
        if (channel.channel_id) partner.channels.add(channel.channel_id);
      }
    }
  }

  const topPartners = [...partnerMap.values()]
    .map((partner) => ({
      ...partner,
      channels: partner.channels.size
    }))
    .sort((a, b) => b.revenue_usd - a.revenue_usd)
    .slice(0, 10);

  return {
    total_revenue_usd: revenueUsd,
    total_paid_usd: paidUsd,
    total_fee_usd: feeUsd,
    total_profit_usd: revenueUsd - paidUsd,
    network_paid: [...networkPaidMap.entries()].map(([network_name, paid_usd]) => ({ network_name, paid_usd })),
    top_partners: topPartners
  };
}

function dashboardRevenueByNetwork(month = "") {
  return db.prepare(`
    SELECT COALESCE(n.name, '-') AS network_name, COALESCE(SUM(cr.revenue), 0) AS revenue_usd
    FROM channel_revenues cr
    LEFT JOIN networks n ON n.id = cr.network_id
    WHERE (? = '' OR cr.month = ?)
    GROUP BY cr.network_id, n.name
    ORDER BY revenue_usd DESC
  `).all(month || "", month || "").map((row) => ({
    network_name: row.network_name || "-",
    revenue_usd: Number(row.revenue_usd || 0)
  }));
}

function dashboardNetworkBreakdown(month = "", groupTotals = {}) {
  const map = new Map();

  function item(networkName) {
    const key = String(networkName || "-").trim() || "-";
    if (!map.has(key)) {
      map.set(key, {
        network_name: key,
        revenue_usd: 0,
        paid_usd: 0,
        profit_usd: 0
      });
    }
    return map.get(key);
  }

  for (const row of dashboardRevenueByNetwork(month)) {
    item(row.network_name).revenue_usd += Number(row.revenue_usd || 0);
  }

  for (const row of groupTotals.network_paid || []) {
    item(row.network_name).paid_usd += Number(row.paid_usd || 0);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      profit_usd: Number(row.revenue_usd || 0) - Number(row.paid_usd || 0)
    }))
    .sort((a, b) => b.revenue_usd - a.revenue_usd);
}

exports.getDashboard = (req, res) => {
  try {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));

    const allRevenue = db.prepare("SELECT COALESCE(SUM(revenue), 0) AS total FROM channel_revenues").get();
    const monthRevenue = db.prepare("SELECT COALESCE(SUM(revenue), 0) AS total FROM channel_revenues WHERE month = ?").get(month);
    const fullGroupTotals = dashboardGroupTotals("");
    const monthGroupTotals = dashboardGroupTotals(month);

    const channelStats = db.prepare(`
      SELECT
        COUNT(*) AS total_channels,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS live_channels,
        SUM(CASE WHEN status != 'active' OR status_error IS NOT NULL THEN 1 ELSE 0 END) AS error_channels
      FROM channels
    `).get();

    const totalPartners = db.prepare("SELECT COUNT(*) AS total FROM partners").get();

    const topChannels = db.prepare(`
      SELECT
        cr.channel_id,
        COALESCE(c.title, cr.channel_id) AS title,
        COALESCE(c.thumbnail, '') AS thumbnail,
        COALESCE(c.status, 'error') AS status,
        COALESCE(SUM(cr.revenue), 0) AS revenue_usd,
        COUNT(DISTINCT cr.month) AS months
      FROM channel_revenues cr
      LEFT JOIN channels c ON c.channel_id = cr.channel_id
      WHERE (? = '' OR cr.month = ?)
      GROUP BY cr.channel_id
      ORDER BY revenue_usd DESC
      LIMIT 10
    `).all(month, month);

    res.json({
      success: true,
      data: {
        month,
        full: {
          total_revenue_usd: Number(allRevenue?.total || 0),
          total_paid_usd: fullGroupTotals.total_paid_usd,
          total_profit_usd: Number(allRevenue?.total || 0) - fullGroupTotals.total_paid_usd,
          total_fee_usd: fullGroupTotals.total_fee_usd
        },
        month_summary: {
          total_revenue_usd: Number(monthRevenue?.total || 0),
          total_paid_usd: monthGroupTotals.total_paid_usd,
          total_profit_usd: Number(monthRevenue?.total || 0) - monthGroupTotals.total_paid_usd,
          total_fee_usd: monthGroupTotals.total_fee_usd
        },
        counts: {
          total_partners: Number(totalPartners?.total || 0),
          total_channels: Number(channelStats?.total_channels || 0),
          live_channels: Number(channelStats?.live_channels || 0),
          error_channels: Number(channelStats?.error_channels || 0)
        },
        top_partners: monthGroupTotals.top_partners,
        top_channels: topChannels.map((channel) => ({
          ...channel,
          revenue_usd: Number(channel.revenue_usd || 0),
          months: Number(channel.months || 0)
        })),
        network_breakdown: {
          full: dashboardNetworkBreakdown("", fullGroupTotals),
          month: dashboardNetworkBreakdown(month, monthGroupTotals)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load report dashboard", error: error.message });
  }
};

function summarizeGroupDetails(details = []) {
  return details.reduce((summary, detail) => {
    const item = detail?.summary || {};
    summary.total_revenue_usd += Number(item.total_revenue_usd || 0);
    summary.total_paid_usd += Number(item.paid_usd || 0);
    summary.total_fee_usd += Number(item.fee_usd || 0);
    summary.total_payable_usd += Number(item.payable_usd || 0);
    summary.total_remaining_usd += Number(item.remaining_usd || 0);
    summary.channels += Number(item.channels || 0);
    summary.rows += Number(item.rows || 0);
    return summary;
  }, {
    total_revenue_usd: 0,
    total_paid_usd: 0,
    total_fee_usd: 0,
    total_payable_usd: 0,
    total_remaining_usd: 0,
    channels: 0,
    rows: 0
  });
}

exports.getPartnerDashboard = (req, res) => {
  try {
    if (!isPartnerUser(req.user)) {
      return res.status(403).json({ success: false, message: "Partner dashboard is only available for partner accounts" });
    }

    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const groupIds = partnerGroupIds(req.user.id);

    if (!groupIds.length) {
      return res.json({
        success: true,
        data: {
          month,
          groups: [],
          monthly: summarizeGroupDetails([]),
          full: summarizeGroupDetails([]),
          counts: { groups: 0, channels: 0, active_channels: 0, error_channels: 0 },
          top_groups: [],
          top_channels: [],
          monthly_summaries: []
        }
      });
    }

    const placeholders = groupIds.map(() => "?").join(",");
    const assignedGroups = db.prepare(`
      SELECT g.id, g.group_name, g.currency, g.partner_id, p.partner_name, p.display_name AS partner_display_name
      FROM channel_groups g
      JOIN partners p ON p.id = g.partner_id
      WHERE g.id IN (${placeholders})
      ORDER BY g.group_name COLLATE NOCASE
    `).all(...groupIds);

    const monthDetails = assignedGroups
      .map((group) => groupDetail(group.id, month))
      .filter(Boolean);

    const revenueMonths = db.prepare(`
      SELECT DISTINCT cr.month
      FROM channel_revenues cr
      JOIN group_channels gc ON gc.channel_id = cr.channel_id
      WHERE gc.group_id IN (${placeholders})
      ORDER BY cr.month DESC
    `).all(...groupIds).map((row) => row.month).filter(Boolean);
    const months = revenueMonths.length ? revenueMonths : [month];
    const allDetails = months.flatMap((itemMonth) =>
      assignedGroups.map((group) => groupDetail(group.id, itemMonth)).filter(Boolean)
    );

    const uniqueChannels = db.prepare(`
      SELECT
        COUNT(DISTINCT gc.channel_id) AS total,
        COUNT(DISTINCT CASE WHEN COALESCE(c.status, 'error') = 'active' THEN gc.channel_id END) AS active,
        COUNT(DISTINCT CASE WHEN COALESCE(c.status, 'error') != 'active' OR c.status_error IS NOT NULL THEN gc.channel_id END) AS error
      FROM group_channels gc
      LEFT JOIN channels c ON c.channel_id = gc.channel_id
      WHERE gc.group_id IN (${placeholders})
    `).get(...groupIds);

    const topGroups = monthDetails
      .map((detail) => ({
        group_id: detail.id,
        group_name: detail.group_name,
        partner_name: detail.partner_display_name || detail.partner_name,
        currency: detail.currency,
        channels: Number(detail.summary?.channels || 0),
        total_revenue_usd: Number(detail.summary?.total_revenue_usd || 0),
        paid_usd: Number(detail.summary?.paid_usd || 0),
        payable_usd: Number(detail.summary?.payable_usd || 0),
        remaining_usd: Number(detail.summary?.remaining_usd || 0)
      }))
      .sort((a, b) => b.total_revenue_usd - a.total_revenue_usd);

    const channelMap = new Map();
    for (const detail of monthDetails) {
      for (const channel of detail.channels || []) {
        const id = channel.channel_id;
        if (!id) continue;
        const current = channelMap.get(id) || {
          channel_id: id,
          title: channel.title || id,
          thumbnail: channel.thumbnail || "",
          status: channel.status || "error",
          group_names: new Set(),
          revenue_usd: 0,
          paid_usd: 0
        };
        current.group_names.add(detail.group_name);
        current.revenue_usd += Number(channel.revenue_usd || 0);
        current.paid_usd += Number(channel.share_amount || 0);
        channelMap.set(id, current);
      }
    }

    const topChannels = Array.from(channelMap.values())
      .map((channel) => ({
        ...channel,
        group_names: Array.from(channel.group_names)
      }))
      .sort((a, b) => b.revenue_usd - a.revenue_usd)
      .slice(0, 10);

    const monthlySummaries = months.slice(0, 12).map((itemMonth) => {
      const details = assignedGroups.map((group) => groupDetail(group.id, itemMonth)).filter(Boolean);
      return {
        month: itemMonth,
        ...summarizeGroupDetails(details)
      };
    });

    res.json({
      success: true,
      data: {
        month,
        groups: topGroups,
        monthly: summarizeGroupDetails(monthDetails),
        full: summarizeGroupDetails(allDetails),
        counts: {
          groups: assignedGroups.length,
          channels: Number(uniqueChannels?.total || 0),
          active_channels: Number(uniqueChannels?.active || 0),
          error_channels: Number(uniqueChannels?.error || 0)
        },
        top_groups: topGroups.slice(0, 10),
        top_channels: topChannels,
        monthly_summaries: monthlySummaries
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load partner dashboard", error: error.message });
  }
};

const NETWORK_PUBLIC_FIELDS = `
  id, name, network_code, description,
  cms_auth_status, cms_auth_email, cms_auth_name, cms_auth_scopes,
  cms_token_expiry, cms_authed_at, cms_auth_error,
  created_at, updated_at
`;

function getCmsAuthFrontendUrl(req) {
  const configuredUrl = String(process.env.FRONTEND_URL || "").trim();
  const isLocalConfigured =
    !configuredUrl ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredUrl);

  if (!isLocalConfigured) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(host || ""));

  if (host && !isLocalHost) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  return configuredUrl || "http://localhost:5176";
}

function redirectCmsAuth(req, status, params = {}) {
  const frontendUrl = getCmsAuthFrontendUrl(req);
  const url = new URL("/networks", frontendUrl);
  url.searchParams.set("cms_auth", status);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

exports.getNetworks = (req, res) => {
  try {
    const rows = db.prepare(`SELECT ${NETWORK_PUBLIC_FIELDS} FROM networks ORDER BY updated_at DESC, id DESC`).all();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy network", error: error.message });
  }
};

exports.createNetwork = (req, res) => {
  try {
    const data = req.body || {};
    const name = String(data.name || "").trim();
    const networkCode = String(data.network_code || "").trim();

    if (!name) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên network" });
    }

    const result = db.prepare(`
      INSERT INTO networks (name, network_code, description)
      VALUES (?, ?, ?)
    `).run(name, networkCode, data.description || "");

    res.json({ success: true, message: "Đã tạo network", data: db.prepare(`SELECT ${NETWORK_PUBLIC_FIELDS} FROM networks WHERE id = ?`).get(result.lastInsertRowid) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tạo network", error: error.message });
  }
};

exports.updateNetwork = (req, res) => {
  try {
    const data = req.body || {};
    const name = String(data.name || "").trim();
    const networkCode = String(data.network_code || "").trim();

    if (!name) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên network" });
    }

    db.prepare(`
      UPDATE networks
      SET name = ?, network_code = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, networkCode, data.description || "", req.params.id);

    res.json({ success: true, message: "Đã cập nhật network" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi cập nhật network", error: error.message });
  }
};

exports.deleteNetwork = (req, res) => {
  try {
    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM channel_revenues WHERE network_id = ?").run(req.params.id);
      db.prepare("DELETE FROM report_imports WHERE network_id = ?").run(req.params.id);
      return db.prepare("DELETE FROM networks WHERE id = ?").run(req.params.id);
    });

    transaction();
    res.json({ success: true, message: "Đã xóa network" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa network", error: error.message });
  }
};

exports.getNetworkCmsAuthUrl = (req, res) => {
  try {
    const network = db.prepare("SELECT id, name FROM networks WHERE id = ?").get(req.params.id);
    if (!network) {
      return res.status(404).json({ success: false, message: "Network not found" });
    }

    const url = cmsAuthService.buildAuthUrl(network.id);
    db.prepare(`
      UPDATE networks
      SET cms_auth_status = 'pending', cms_auth_error = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(network.id);

    res.json({ success: true, data: { url } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not create Google CMS auth URL", error: error.message });
  }
};

exports.handleNetworkCmsAuthCallback = async (req, res) => {
  let networkId = null;

  try {
    const state = cmsAuthService.parseState(req.query.state);
    networkId = state.network_id;

    if (req.query.error) {
      db.prepare(`
        UPDATE networks
        SET cms_auth_status = 'error', cms_auth_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(String(req.query.error), networkId);
      return res.redirect(redirectCmsAuth(req, "error", { network_id: networkId, message: req.query.error }));
    }

    const code = String(req.query.code || "");
    if (!code) throw new Error("Missing Google OAuth code");

    const existing = db.prepare("SELECT id, cms_refresh_token FROM networks WHERE id = ?").get(networkId);
    if (!existing) throw new Error("Network not found");

    const token = await cmsAuthService.exchangeCode(code);
    const user = token.access_token ? await cmsAuthService.getGoogleUser(token.access_token) : {};
    const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null;

    db.prepare(`
      UPDATE networks
      SET cms_auth_status = 'connected',
          cms_auth_email = ?,
          cms_auth_name = ?,
          cms_auth_scopes = ?,
          cms_access_token = ?,
          cms_refresh_token = ?,
          cms_token_expiry = ?,
          cms_authed_at = CURRENT_TIMESTAMP,
          cms_auth_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      user.email || "",
      user.name || "",
      token.scope || cmsAuthService.CMS_SCOPES.join(" "),
      token.access_token || "",
      token.refresh_token || existing.cms_refresh_token || "",
      expiresAt,
      networkId
    );

    return res.redirect(redirectCmsAuth(req, "success", { network_id: networkId }));
  } catch (error) {
    if (networkId) {
      db.prepare(`
        UPDATE networks
        SET cms_auth_status = 'error', cms_auth_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(error.message, networkId);
    }
    return res.redirect(redirectCmsAuth(req, "error", { network_id: networkId, message: error.message }));
  }
};

exports.disconnectNetworkCmsAuth = (req, res) => {
  try {
    const network = db.prepare("SELECT id FROM networks WHERE id = ?").get(req.params.id);
    if (!network) {
      return res.status(404).json({ success: false, message: "Network not found" });
    }

    db.prepare(`
      UPDATE networks
      SET cms_auth_status = 'not_connected',
          cms_auth_email = NULL,
          cms_auth_name = NULL,
          cms_auth_scopes = NULL,
          cms_access_token = NULL,
          cms_refresh_token = NULL,
          cms_token_expiry = NULL,
          cms_authed_at = NULL,
          cms_auth_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);

    res.json({ success: true, message: "CMS auth disconnected" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not disconnect CMS auth", error: error.message });
  }
};

exports.getExchangeRates = (req, res) => {
  try {
    const month = String(req.query.month || "");
    const rows = db.prepare(`
      SELECT *
      FROM exchange_rates
      WHERE (? = '' OR month = ?)
      ORDER BY month DESC
    `).all(month, month);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Loi lay ty gia", error: error.message });
  }
};

exports.createExchangeRate = (req, res) => {
  try {
    const data = req.body || {};
    const month = String(data.month || "").trim();

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "Vui long chon thang dang YYYY-MM" });
    }

    db.prepare(`
      INSERT INTO exchange_rates (
        month, usd_to_vnd, usd_to_vnd_description, usd_to_gbp, usd_to_gbp_description, updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(month) DO UPDATE SET
        usd_to_vnd = excluded.usd_to_vnd,
        usd_to_vnd_description = excluded.usd_to_vnd_description,
        usd_to_gbp = excluded.usd_to_gbp,
        usd_to_gbp_description = excluded.usd_to_gbp_description,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      month,
      Number(data.usd_to_vnd || 0),
      data.usd_to_vnd_description || "",
      Number(data.usd_to_gbp || 0),
      data.usd_to_gbp_description || ""
    );

    const row = db.prepare("SELECT * FROM exchange_rates WHERE month = ?").get(month);
    res.json({ success: true, message: "Da luu ty gia", data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: "Loi luu ty gia", error: error.message });
  }
};

exports.updateExchangeRate = (req, res) => {
  try {
    const data = req.body || {};
    const month = String(data.month || "").trim();

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "Vui long chon thang dang YYYY-MM" });
    }

    db.prepare(`
      UPDATE exchange_rates
      SET month = ?,
          usd_to_vnd = ?,
          usd_to_vnd_description = ?,
          usd_to_gbp = ?,
          usd_to_gbp_description = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      month,
      Number(data.usd_to_vnd || 0),
      data.usd_to_vnd_description || "",
      Number(data.usd_to_gbp || 0),
      data.usd_to_gbp_description || "",
      req.params.id
    );

    res.json({ success: true, message: "Da cap nhat ty gia" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Loi cap nhat ty gia", error: error.message });
  }
};

exports.deleteExchangeRate = (req, res) => {
  try {
    db.prepare("DELETE FROM exchange_rates WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Da xoa ty gia" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Loi xoa ty gia", error: error.message });
  }
};

exports.getCompanies = (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM companies ORDER BY updated_at DESC, id DESC").all();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load companies", error: error.message });
  }
};

exports.createCompany = (req, res) => {
  try {
    const data = req.body || {};
    const name = String(data.company_name || "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Company name is required" });
    }

    const result = db.prepare(`
      INSERT INTO companies (
        company_name, email, phone, address, representative_name,
        representative_position, hr_name, bank_name, account_number, tax_code, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      data.email || "",
      data.phone || "",
      data.address || "",
      data.representative_name || "",
      data.representative_position || "",
      data.hr_name || "",
      data.bank_name || "",
      data.account_number || "",
      data.tax_code || "",
      data.notes || ""
    );

    res.json({ success: true, message: "Company created", data: db.prepare("SELECT * FROM companies WHERE id = ?").get(result.lastInsertRowid) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not create company", error: error.message });
  }
};

exports.updateCompany = (req, res) => {
  try {
    const data = req.body || {};
    const name = String(data.company_name || "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Company name is required" });
    }

    db.prepare(`
      UPDATE companies
      SET company_name = ?,
          email = ?,
          phone = ?,
          address = ?,
          representative_name = ?,
          representative_position = ?,
          hr_name = ?,
          bank_name = ?,
          account_number = ?,
          tax_code = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      data.email || "",
      data.phone || "",
      data.address || "",
      data.representative_name || "",
      data.representative_position || "",
      data.hr_name || "",
      data.bank_name || "",
      data.account_number || "",
      data.tax_code || "",
      data.notes || "",
      req.params.id
    );

    res.json({ success: true, message: "Company updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update company", error: error.message });
  }
};

exports.deleteCompany = (req, res) => {
  try {
    db.prepare("DELETE FROM companies WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Company deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not delete company", error: error.message });
  }
};

exports.getPartners = (req, res) => {
  try {
    syncExpiredPartnerContracts();
    const scope = String(req.query.scope || "");
    const rows = db.prepare(`
      SELECT * FROM partners
      ${scope === "active" ? "WHERE partner_status = 'active'" : ""}
      ORDER BY updated_at DESC, id DESC
    `).all();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy partner", error: error.message });
  }
};

const PARTNER_IMPORT_HEADERS = {
  id: "id",
  partner_id: "id",
  partner_display_name: "display_name",
  display_name: "display_name",
  display: "display_name",
  name: "partner_name",
  partner_name: "partner_name",
  partner: "partner_name",
  email: "email",
  full_name: "contact_name",
  contact_name: "contact_name",
  phone_number: "phone",
  phone: "phone",
  email_counter_control: "counter_email",
  counter_email: "counter_email",
  address: "address",
  payment_method: "payment_method",
  payment_type: "payment_method",
  pingpongx: "pingpongx",
  pingpongx_email: "pingpongx",
  payment_number: "account_number",
  account_number: "account_number",
  bank_name: "bank_name",
  bank_holder: "bank_holder",
  account_holder: "bank_holder",
  swift_code: "swift_code",
  bank_branch: "bank_branch",
  partner_status: "partner_status",
  request_token: "request_token",
  request_submitted_at: "request_submitted_at",
  note: "internal_notes",
  notes: "internal_notes",
  internal_notes: "internal_notes",
  contract_status: "contract_status",
  contract_notes: "contract_notes",
  contract_sent_at: "contract_sent_at",
  contract_signed_at: "contract_signed_at",
  contract_start_at: "contract_start_at",
  contract_end_at: "contract_end_at",
  contract_file_name: "contract_file_name",
  contract_file_data_url: "contract_file_data_url",
  created_at: "created_at",
  updated_at: "updated_at"
};

const PARTNER_TEMPLATE_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "partner_name", header: "Partner Name" },
  { key: "display_name", header: "Display Name" },
  { key: "email", header: "Email" },
  { key: "contact_name", header: "Full Name" },
  { key: "phone", header: "Phone" },
  { key: "counter_email", header: "Counter Email" },
  { key: "address", header: "Address" },
  { key: "payment_method", header: "Payment Method" },
  { key: "pingpongx", header: "PingPongX" },
  { key: "bank_name", header: "Bank Name" },
  { key: "bank_holder", header: "Bank Holder" },
  { key: "account_number", header: "Account Number" },
  { key: "swift_code", header: "SWIFT Code" },
  { key: "bank_branch", header: "Bank Branch" },
  { key: "partner_status", header: "Partner Status" }
];

const PARTNER_CONTRACT_STATUSES = ["incomplete_info", "not_created", "sent_waiting", "done", "renewal_needed"];
const PARTNER_STATUSES = ["request_sent", "request_done", "active"];

function todaySqlDate() {
  return new Date().toISOString().slice(0, 10);
}

function syncExpiredPartnerContracts() {
  db.prepare(`
    UPDATE partners
    SET contract_status = 'renewal_needed', updated_at = CURRENT_TIMESTAMP
    WHERE contract_status = 'done'
      AND contract_end_at IS NOT NULL
      AND date(contract_end_at) < date(?)
  `).run(todaySqlDate());
}

function normalizeHeader(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function cellText(cell) {
  const value = cell?.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (value.text) return String(value.text);
    if (value.result != null) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  }
  return String(cell.text || value || "");
}

function toSqlDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

function normalizePartnerImportRow(raw) {
  const partner = {};
  Object.entries(raw).forEach(([key, value]) => {
    const mapped = PARTNER_IMPORT_HEADERS[normalizeHeader(key)];
    if (!mapped) return;
    partner[mapped] = String(value || "").trim();
  });

  partner.id = Number(partner.id) || null;
  partner.partner_name = partner.partner_name || partner.display_name || partner.email || "";
  partner.display_name = partner.display_name || "";
  partner.email = partner.email || "";
  partner.contact_name = partner.contact_name || "";
  partner.phone = partner.phone || "";
  partner.counter_email = partner.counter_email || "";
  partner.address = partner.address || "";
  partner.pingpongx = partner.pingpongx || "";
  partner.payment_method = partner.pingpongx ? "pingpongx" : "bank";
  partner.bank_name = partner.bank_name || "";
  partner.bank_holder = partner.bank_holder || "";
  partner.account_number = partner.account_number || "";
  partner.swift_code = partner.swift_code || "";
  partner.bank_branch = partner.bank_branch || "";
  partner.partner_status = PARTNER_STATUSES.includes(partner.partner_status) ? partner.partner_status : "active";
  partner.request_token = partner.request_token || null;
  partner.request_submitted_at = toSqlDate(partner.request_submitted_at);
  partner.internal_notes = partner.internal_notes || "";
  partner.contract_status = PARTNER_CONTRACT_STATUSES.includes(partner.contract_status) ? partner.contract_status : "not_created";
  partner.contract_notes = partner.contract_notes || "";
  partner.contract_sent_at = toSqlDate(partner.contract_sent_at);
  partner.contract_signed_at = toSqlDate(partner.contract_signed_at);
  partner.contract_start_at = toSqlDate(partner.contract_start_at);
  partner.contract_end_at = toSqlDate(partner.contract_end_at);
  partner.contract_file_name = partner.contract_file_name || "";
  partner.contract_file_data_url = partner.contract_file_data_url || "";
  partner.created_at = toSqlDate(partner.created_at);
  partner.updated_at = toSqlDate(partner.updated_at);
  return partner;
}

function formatPartnerTemplateValue(row, key) {
  const value = row?.[key];
  if (value == null) return "";
  return value;
}

exports.exportPartnerTemplate = async (req, res) => {
  try {
    syncExpiredPartnerContracts();
    const selectedIds = String(req.query.ids || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ANS Network";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Partners", {
      views: [{ state: "frozen", ySplit: 1 }]
    });
    worksheet.columns = PARTNER_TEMPLATE_COLUMNS.map((column) => ({
      header: column.header,
      key: column.key,
      width: Math.max(16, column.header.length + 4)
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 24;

    const partners = selectedIds.length
      ? db.prepare(`
          SELECT * FROM partners
          WHERE id IN (${selectedIds.map(() => "?").join(",")})
          ORDER BY partner_name COLLATE NOCASE, id ASC
        `).all(...selectedIds)
      : db.prepare("SELECT * FROM partners ORDER BY partner_name COLLATE NOCASE, id ASC").all();
    partners.forEach((partner) => {
      const data = {};
      PARTNER_TEMPLATE_COLUMNS.forEach((column) => {
        data[column.key] = formatPartnerTemplateValue(partner, column.key);
      });
      data.payment_method = partner.pingpongx ? "pingpongx" : "bank";
      worksheet.addRow(data);
    });

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD9E2EC" } },
          left: { style: "thin", color: { argb: "FFD9E2EC" } },
          bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
          right: { style: "thin", color: { argb: "FFD9E2EC" } }
        };
        if (rowNumber > 1) {
          cell.alignment = { vertical: "top", wrapText: true };
        }
      });
    });

    worksheet.getColumn("address").width = 36;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"partner-import-template.xlsx\"");
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not export partner template", error: error.message });
  }
};

function validatePartnerContractPayload(status, data) {
  if (status !== "done") return null;
  if (!String(data.contract_start_at || "").trim() || !String(data.contract_end_at || "").trim()) {
    return "Done contract requires a contract start date and end date.";
  }
  const start = new Date(data.contract_start_at);
  const end = new Date(data.contract_end_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Contract start date and end date must be valid dates.";
  }
  if (end < start) {
    return "Contract end date must be after the start date.";
  }
  if (!String(data.contract_file_data_url || "").startsWith("data:application/pdf")) {
    return "Done contract requires an uploaded signed PDF contract file.";
  }
  return null;
}

function publicPartnerPayload(partner) {
  if (!partner || !partner.request_token || partner.partner_status === "active") return null;
  return {
    id: partner.id,
    partner_name: partner.partner_name,
    display_name: partner.display_name,
    email: partner.email,
    contact_name: partner.contact_name,
    phone: partner.phone,
    counter_email: partner.counter_email,
    address: partner.address,
    payment_method: partner.payment_method || "pingpongx",
    pingpongx: partner.pingpongx,
    bank_name: partner.bank_name,
    bank_holder: partner.bank_holder,
    account_number: partner.account_number,
    swift_code: partner.swift_code,
    bank_branch: partner.bank_branch,
    internal_notes: partner.internal_notes,
    partner_status: partner.partner_status
  };
}

exports.createPartnerRequest = (req, res) => {
  try {
    const partnerName = String(req.body?.partner_name || "").trim();
    if (!partnerName) {
      return res.status(400).json({ success: false, message: "Partner name is required" });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const result = db.prepare(`
      INSERT INTO partners (partner_name, partner_status, request_token, contract_status, internal_notes)
      VALUES (?, 'request_sent', ?, 'not_created', ?)
    `).run(partnerName, token, req.body?.internal_notes || "");

    const partner = db.prepare("SELECT * FROM partners WHERE id = ?").get(result.lastInsertRowid);
    res.json({ success: true, message: "Partner request link created", data: { ...partner, request_url: `/partner-request/${token}` } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not create partner request", error: error.message });
  }
};

exports.approvePartnerRequest = (req, res) => {
  try {
    const current = db.prepare("SELECT * FROM partners WHERE id = ?").get(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: "Partner not found" });
    if (current.partner_status !== "request_done") {
      return res.status(400).json({ success: false, message: "Partner request must be completed before approval" });
    }

    db.prepare(`
      UPDATE partners
      SET partner_status = 'active', request_token = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);
    res.json({ success: true, message: "Partner approved" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not approve partner", error: error.message });
  }
};

exports.deletePartnerRequestLink = (req, res) => {
  try {
    const current = db.prepare("SELECT * FROM partners WHERE id = ?").get(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: "Partner not found" });
    if (current.partner_status === "request_sent") {
      db.prepare("DELETE FROM partners WHERE id = ?").run(req.params.id);
      return res.json({ success: true, message: "Partner request link deleted" });
    }

    db.prepare("UPDATE partners SET request_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Partner request link removed" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not delete request link", error: error.message });
  }
};

exports.getPublicPartnerRequest = (req, res) => {
  try {
    const partner = db.prepare("SELECT * FROM partners WHERE request_token = ?").get(req.params.token);
    const data = publicPartnerPayload(partner);
    if (!data) return res.status(404).json({ success: false, message: "Partner request link is invalid or no longer available" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load partner request", error: error.message });
  }
};

exports.submitPublicPartnerRequest = (req, res) => {
  try {
    const partner = db.prepare("SELECT * FROM partners WHERE request_token = ?").get(req.params.token);
    if (!partner || partner.partner_status === "active") {
      return res.status(404).json({ success: false, message: "Partner request link is invalid or no longer available" });
    }

    const data = req.body || {};
    if (!String(data.partner_name || partner.partner_name || "").trim()) {
      return res.status(400).json({ success: false, message: "Partner name is required" });
    }
    const paymentMethod = String(data.payment_method || "pingpongx").toLowerCase() === "bank" ? "bank" : "pingpongx";
    const required = [
      ["email", "Email"],
      ["contact_name", "Contact person"],
      ["phone", "Phone"],
      ["address", "Address"]
    ];
    if (paymentMethod === "pingpongx") {
      required.push(["pingpongx", "PingPongX email"]);
    } else {
      required.push(
        ["bank_name", "Bank name"],
        ["bank_holder", "Bank holder"],
        ["account_number", "Account number"],
        ["swift_code", "SWIFT code"],
        ["bank_branch", "Bank branch"]
      );
    }
    const missing = required.filter(([key]) => !String(data[key] || "").trim()).map(([, label]) => label);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Please complete required fields: ${missing.join(", ")}` });
    }

    db.prepare(`
      UPDATE partners SET
        partner_name = ?, display_name = ?, email = ?, contact_name = ?, phone = ?,
        counter_email = ?, address = ?, payment_method = ?, pingpongx = ?, bank_name = ?,
        bank_holder = ?, account_number = ?, swift_code = ?, bank_branch = ?,
        internal_notes = ?, partner_status = 'request_done', request_submitted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.partner_name || partner.partner_name,
      data.display_name || "",
      data.email || "",
      data.contact_name || "",
      data.phone || "",
      data.counter_email || "",
      data.address || "",
      paymentMethod,
      data.pingpongx || "",
      data.bank_name || "",
      data.bank_holder || "",
      data.account_number || "",
      data.swift_code || "",
      data.bank_branch || "",
      data.internal_notes || "",
      partner.id
    );

    res.json({ success: true, message: "Partner request submitted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not submit partner request", error: error.message });
  }
};

exports.importPartners = async (req, res) => {
  try {
    const { fileName = "", fileBase64 = "" } = req.body || {};
    if (!fileBase64) {
      return res.status(400).json({ success: false, message: "Import file is required" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(String(fileBase64).replace(/^data:.*?;base64,/, ""), "base64"));
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ success: false, message: "Workbook has no sheets" });
    }

    const headers = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = cellText(cell);
    });

    const insertStmt = db.prepare(`
      INSERT INTO partners (
        partner_name, display_name, email, contact_name, phone, counter_email,
        address, payment_method, pingpongx, bank_name, bank_holder, account_number,
        swift_code, bank_branch, partner_status, request_token, request_submitted_at, contract_status,
        contract_notes, contract_sent_at, contract_signed_at, contract_start_at,
        contract_end_at, contract_file_name, contract_file_data_url, internal_notes,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
    `);

    const updateStmt = db.prepare(`
      UPDATE partners SET
        partner_name = ?, display_name = ?, email = ?, contact_name = ?, phone = ?,
        counter_email = ?, address = ?, payment_method = ?, pingpongx = ?, bank_name = ?,
        bank_holder = ?, account_number = ?, swift_code = ?, bank_branch = ?,
        partner_status = ?, request_token = ?, request_submitted_at = ?,
        contract_status = ?, contract_notes = ?, contract_sent_at = ?,
        contract_signed_at = ?, contract_start_at = ?, contract_end_at = ?, contract_file_name = ?,
        contract_file_data_url = ?, internal_notes = ?, updated_at = COALESCE(?, CURRENT_TIMESTAMP)
      WHERE id = ?
    `);

    const findById = db.prepare("SELECT * FROM partners WHERE id = ? LIMIT 1");
    const findByEmail = db.prepare("SELECT * FROM partners WHERE lower(email) = lower(?) LIMIT 1");
    const findByName = db.prepare("SELECT * FROM partners WHERE lower(partner_name) = lower(?) LIMIT 1");
    const summary = { file_name: fileName, created: 0, updated: 0, skipped: 0, errors: [] };

    const transaction = db.transaction(() => {
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const raw = {};
        headers.forEach((header, colNumber) => {
          if (header) raw[header] = cellText(row.getCell(colNumber));
        });

        const partner = normalizePartnerImportRow(raw);
        if (!partner.partner_name) {
          summary.skipped += 1;
          summary.errors.push({ row: rowNumber, message: "Missing partner name" });
          continue;
        }

        const existing = (partner.id ? findById.get(partner.id) : null)
          || (partner.email ? findByEmail.get(partner.email) : null)
          || findByName.get(partner.partner_name);
        if (existing) {
          updateStmt.run(
            partner.partner_name,
            partner.display_name,
            partner.email,
            partner.contact_name,
            partner.phone,
            partner.counter_email,
            partner.address,
            partner.payment_method,
            partner.pingpongx,
            partner.bank_name,
            partner.bank_holder,
            partner.account_number,
            partner.swift_code,
            partner.bank_branch,
            partner.partner_status,
            partner.request_token,
            partner.request_submitted_at,
            partner.contract_status,
            partner.contract_notes,
            partner.contract_sent_at,
            partner.contract_signed_at,
            partner.contract_start_at,
            partner.contract_end_at,
            partner.contract_file_name,
            partner.contract_file_data_url,
            partner.internal_notes,
            partner.updated_at,
            existing.id
          );
          summary.updated += 1;
          continue;
        }

        insertStmt.run(
          partner.partner_name,
          partner.display_name,
          partner.email,
          partner.contact_name,
          partner.phone,
          partner.counter_email,
          partner.address,
          partner.payment_method,
          partner.pingpongx,
          partner.bank_name,
          partner.bank_holder,
          partner.account_number,
          partner.swift_code,
          partner.bank_branch,
          partner.partner_status,
          partner.request_token,
          partner.request_submitted_at,
          partner.contract_status,
          partner.contract_notes,
          partner.contract_sent_at,
          partner.contract_signed_at,
          partner.contract_start_at,
          partner.contract_end_at,
          partner.contract_file_name,
          partner.contract_file_data_url,
          partner.internal_notes,
          partner.created_at,
          partner.updated_at
        );
        summary.created += 1;
      }
    });

    transaction();
    res.json({ success: true, message: "Partners imported", data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not import partners", error: error.message });
  }
};

exports.createPartner = (req, res) => {
  try {
    const data = req.body || {};
    if (!String(data.partner_name || "").trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập Partner Name" });
    }

    const contractStatus = PARTNER_CONTRACT_STATUSES.includes(String(data.contract_status || ""))
      ? data.contract_status
      : "not_created";
    const partnerStatus = PARTNER_STATUSES.includes(String(data.partner_status || ""))
      ? data.partner_status
      : "active";
    const contractError = validatePartnerContractPayload(contractStatus, data);
    if (contractError) {
      return res.status(400).json({ success: false, message: contractError });
    }

    const result = db.prepare(`
      INSERT INTO partners (
        partner_name, display_name, email, contact_name, phone, counter_email,
        address, payment_method, pingpongx, bank_name, bank_holder, account_number,
        swift_code, bank_branch, partner_status, request_token,
        request_submitted_at, contract_status,
        contract_notes, contract_sent_at, contract_signed_at, contract_start_at,
        contract_end_at, contract_file_name, contract_file_data_url, internal_notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.partner_name,
      data.display_name || "",
      data.email || "",
      data.contact_name || "",
      data.phone || "",
      data.counter_email || "",
      data.address || "",
      String(data.payment_method || "pingpongx").toLowerCase() === "bank" ? "bank" : "pingpongx",
      data.pingpongx || "",
      data.bank_name || "",
      data.bank_holder || "",
      data.account_number || "",
      data.swift_code || "",
      data.bank_branch || "",
      partnerStatus,
      data.request_token || null,
      data.request_submitted_at || null,
      contractStatus,
      data.contract_notes || "",
      data.contract_sent_at || null,
      data.contract_signed_at || null,
      data.contract_start_at || null,
      data.contract_end_at || null,
      data.contract_file_name || "",
      data.contract_file_data_url || "",
      data.internal_notes || ""
    );

    res.json({ success: true, message: "Đã tạo partner", data: db.prepare("SELECT * FROM partners WHERE id = ?").get(result.lastInsertRowid) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tạo partner", error: error.message });
  }
};

exports.updatePartner = (req, res) => {
  try {
    const data = req.body || {};
    const current = db.prepare("SELECT * FROM partners WHERE id = ?").get(req.params.id);
    if (!current) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }
    const pick = (key, fallback = "") => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : (current[key] ?? fallback);
    const contractStatus = PARTNER_CONTRACT_STATUSES.includes(String(pick("contract_status", "not_created")))
      ? pick("contract_status", "not_created")
      : "not_created";
    const partnerStatus = PARTNER_STATUSES.includes(String(pick("partner_status", "active")))
      ? pick("partner_status", "active")
      : "active";
    const contractError = validatePartnerContractPayload(contractStatus, {
      contract_start_at: pick("contract_start_at", null),
      contract_end_at: pick("contract_end_at", null),
      contract_file_data_url: pick("contract_file_data_url", "")
    });
    if (contractError) {
      return res.status(400).json({ success: false, message: contractError });
    }

    db.prepare(`
      UPDATE partners SET
        partner_name = ?, display_name = ?, email = ?, contact_name = ?, phone = ?,
        counter_email = ?, address = ?, payment_method = ?, pingpongx = ?, bank_name = ?,
        bank_holder = ?, account_number = ?, swift_code = ?, bank_branch = ?,
        partner_status = ?, request_token = ?, request_submitted_at = ?,
        contract_status = ?, contract_notes = ?, contract_sent_at = ?,
        contract_signed_at = ?, contract_start_at = ?, contract_end_at = ?, contract_file_name = ?,
        contract_file_data_url = ?, internal_notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      pick("partner_name"),
      pick("display_name"),
      pick("email"),
      pick("contact_name"),
      pick("phone"),
      pick("counter_email"),
      pick("address"),
      String(pick("payment_method", "pingpongx")).toLowerCase() === "bank" ? "bank" : "pingpongx",
      pick("pingpongx"),
      pick("bank_name"),
      pick("bank_holder"),
      pick("account_number"),
      pick("swift_code"),
      pick("bank_branch"),
      partnerStatus,
      pick("request_token", null) || null,
      pick("request_submitted_at", null) || null,
      contractStatus,
      pick("contract_notes"),
      pick("contract_sent_at", null) || null,
      pick("contract_signed_at", null) || null,
      pick("contract_start_at", null) || null,
      pick("contract_end_at", null) || null,
      pick("contract_file_name"),
      pick("contract_file_data_url"),
      pick("internal_notes"),
      req.params.id
    );

    res.json({ success: true, message: "Đã cập nhật partner" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi cập nhật partner", error: error.message });
  }
};

exports.deletePartner = (req, res) => {
  try {
    db.prepare("DELETE FROM group_channels WHERE group_id IN (SELECT id FROM channel_groups WHERE partner_id = ?)").run(req.params.id);
    db.prepare("DELETE FROM channel_groups WHERE partner_id = ?").run(req.params.id);
    db.prepare("DELETE FROM partners WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Đã xóa partner" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa partner", error: error.message });
  }
};

exports.getGroups = (req, res) => {
  try {
    const month = String(req.query.month || "");
    const allowedGroupIds = isPartnerUser(req.user) ? partnerGroupIds(req.user.id) : null;

    if (allowedGroupIds && allowedGroupIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const groupWhere = allowedGroupIds ? `WHERE g.id IN (${allowedGroupIds.map(() => "?").join(",")})` : "";
    const groups = db.prepare(`
      SELECT g.*, p.partner_name, COUNT(gc.id) AS channel_count
      FROM channel_groups g
      JOIN partners p ON p.id = g.partner_id
      LEFT JOIN group_channels gc ON gc.group_id = g.id
      ${groupWhere}
      GROUP BY g.id
      ORDER BY g.updated_at DESC, g.id DESC
    `).all(...(allowedGroupIds || [])).map(parseGroup).map((group) => {
      const detail = groupDetail(group.id, month);
      return { ...group, summary: detail?.summary || null };
    });

    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy group", error: error.message });
  }
};

exports.createGroup = (req, res) => {
  try {
    const data = req.body || {};
    if (!data.partner_id || !String(data.group_name || "").trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn partner và nhập tên group" });
    }

    const result = db.prepare(`
      INSERT INTO channel_groups (partner_id, group_name, currency, fee_rate, apply_revenue_tax, description, tiers)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.partner_id, data.group_name, normalizeCurrency(data.currency), Number(data.fee_rate || 0), data.apply_revenue_tax ? 1 : 0, data.description || "", JSON.stringify(data.tiers || []));

    res.json({ success: true, message: "Đã tạo group", data: groupDetail(result.lastInsertRowid, data.month || "") });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tạo group", error: error.message });
  }
};

exports.updateGroup = (req, res) => {
  try {
    const data = req.body || {};
    db.prepare(`
      UPDATE channel_groups SET partner_id = ?, group_name = ?, currency = ?, fee_rate = ?,
        apply_revenue_tax = ?, description = ?, tiers = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.partner_id, data.group_name, normalizeCurrency(data.currency), Number(data.fee_rate || 0), data.apply_revenue_tax ? 1 : 0, data.description || "", JSON.stringify(data.tiers || []), req.params.id);

    res.json({ success: true, message: "Đã cập nhật group" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi cập nhật group", error: error.message });
  }
};

exports.deleteGroup = (req, res) => {
  try {
    db.prepare("DELETE FROM user_group_permissions WHERE group_id = ?").run(req.params.id);
    db.prepare("DELETE FROM group_channels WHERE group_id = ?").run(req.params.id);
    db.prepare("DELETE FROM channel_groups WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Đã xóa group" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa group", error: error.message });
  }
};

exports.getGroupDetail = (req, res) => {
  try {
    if (!canUserReadGroup(req.user, req.params.id)) {
      return res.status(403).json({ success: false, message: "You do not have access to this group" });
    }
    const detail = groupDetail(req.params.id, String(req.query.month || ""));
    if (!detail) return res.status(404).json({ success: false, message: "Không tìm thấy group" });
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy chi tiết group", error: error.message });
  }
};

exports.exportGroupExcel = async (req, res) => {
  try {
    if (!canUserReadGroup(req.user, req.params.id)) {
      return res.status(403).json({ success: false, message: "You do not have access to this group" });
    }
    const detail = groupDetail(req.params.id, String(req.body?.month || req.query.month || ""));
    if (!detail) return res.status(404).json({ success: false, message: "Group not found" });
    await sendExcelExport(res, detail, selectedCompany(req.body?.company_id || req.query.company_id), {
      export_us_br: Boolean(req.body?.export_us_br || req.query.export_us_br)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not export Excel", error: error.message });
  }
};

exports.exportGroupPdf = async (req, res) => {
  try {
    if (!canUserReadGroup(req.user, req.params.id)) {
      return res.status(403).json({ success: false, message: "You do not have access to this group" });
    }
    const detail = groupDetail(req.params.id, String(req.body?.month || req.query.month || ""));
    if (!detail) return res.status(404).json({ success: false, message: "Group not found" });
    await sendPdfExport(res, detail, selectedCompany(req.body?.company_id || req.query.company_id), {
      base64: Boolean(req.body?.return_base64 || req.query.return_base64),
      includeSignatures: Boolean(req.body?.include_signatures || req.query.include_signatures)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not export PDF", error: error.message });
  }
};

exports.addGroupChannels = async (req, res) => {
  try {
    const { channel_inputs, revenue_share, month } = req.body;
    const group = db.prepare("SELECT * FROM channel_groups WHERE id = ?").get(req.params.id);

    if (!group) {
      return res.status(404).json({ success: false, message: "Không tìm thấy group" });
    }

    const inputs = [...new Set(parseChannelInputs(channel_inputs))];
    const directIds = inputs.filter((input) => !input.startsWith("@"));
    const handleInputs = inputs.filter((input) => input.startsWith("@"));
    const resolvedIds = [...directIds];

    for (const handle of handleInputs) {
      const channel = await getChannelFromYoutube(handle);
      upsertChannel(channel);
      resolvedIds.push(channel.channel_id);
    }

    const uniqueChannels = [...new Set(resolvedIds)];
    const existingInGroup = existingGroupChannelRows(req.params.id, uniqueChannels);
    const duplicateChannelIds = new Set(existingInGroup.map((channel) => channel.channel_id));
    const channelsToInsert = uniqueChannels.filter((channelId) => !duplicateChannelIds.has(channelId));

    if (channelsToInsert.length === 0 && existingInGroup.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Channel already exists in this group: ${existingInGroup.map((channel) => `${channel.title || "Channel"} (${channel.channel_id})`).join(", ")}`,
        data: {
          duplicate_channels: existingInGroup
        }
      });
    }

    const existingReportIds = existingReportChannelIds(directIds);
    const directIdsMissingFromReport = directIds.filter((channelId) => !existingReportIds.has(channelId));
    const managedRows = managedChannelRowsByIds(directIdsMissingFromReport);
    for (const channel of managedRows) {
      upsertChannel({
        channel_id: channel.channel_id,
        title: channel.title || channel.channel_id,
        description: channel.description || "",
        custom_url: channel.custom_url || "",
        thumbnail: channel.thumbnail || "",
        view_count: Number(channel.view_count || 0),
        subscriber_count: Number(channel.subscriber_count || 0),
        video_count: Number(channel.video_count || 0),
        country: channel.country || "",
        published_at: channel.published_at || "",
        latest_videos: undefined
      });
    }

    const managedIds = new Set(managedRows.map((channel) => channel.channel_id));
    const idsNeedingYoutube = directIdsMissingFromReport.filter((channelId) => !managedIds.has(channelId));
    const youtubeChannels = await getChannelsFromYoutube(idsNeedingYoutube);
    for (const channel of youtubeChannels) upsertChannel(channel);

    const foundDirectIds = new Set(youtubeChannels.map((channel) => channel.channel_id));
    const missingDirectIds = idsNeedingYoutube.filter((channelId) => !foundDirectIds.has(channelId));
    for (const channelId of missingDirectIds) {
      upsertPlaceholderChannel(channelId, "Không lấy được dữ liệu từ YouTube khi thêm vào group");
    }
    const customShare = revenue_share === "" || revenue_share == null ? null : Number(revenue_share);

    if (customShare != null && (Number.isNaN(customShare) || customShare < 0 || customShare > 100)) {
      return res.status(400).json({ success: false, message: "Revenue share phải nằm trong khoảng 0% đến 100%" });
    }

    const managedShareRows = managedChannelRowsByIds(channelsToInsert);
    const managedShareByChannel = new Map(
      managedShareRows
        .map((channel) => ({
          channel_id: channel.channel_id,
          revenue_share_rate: Number(channel.revenue_share_rate)
        }))
        .filter((channel) => Number.isFinite(channel.revenue_share_rate) && channel.revenue_share_rate >= 0 && channel.revenue_share_rate <= 100)
        .map((channel) => [channel.channel_id, channel.revenue_share_rate])
    );
    const defaultGroupShare = groupDefaultShare(req.params.id, month || "");
    const shareForChannel = (channelId) => {
      if (customShare != null) return customShare;
      if (managedShareByChannel.has(channelId)) return managedShareByChannel.get(channelId);
      return defaultGroupShare;
    };
    const customShareForInsert = (channelId) => {
      if (customShare != null) return customShare;
      if (managedShareByChannel.has(channelId)) return managedShareByChannel.get(channelId);
      return null;
    };

    const invalidChannels = channelsToInsert
      .map((channelId) => {
        const appliedShare = shareForChannel(channelId);
        const existingShare = existingShareForChannel(channelId, month || "", req.params.id);
        return {
          channel_id: channelId,
          existing_share: existingShare,
          new_share: appliedShare,
          total_share: existingShare + appliedShare
        };
      })
      .filter((item) => item.total_share > 100);

    if (invalidChannels.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Không thể thêm channel vì tổng revenue share vượt quá 100%",
        data: {
          invalid_channels: invalidChannels
        }
      });
    }

    const stmt = db.prepare(`
      INSERT INTO group_channels (group_id, channel_id, custom_share)
      VALUES (?, ?, ?)
    `);

    const insertChannels = db.transaction((channelIds) => {
      for (const channelId of channelIds) stmt.run(req.params.id, channelId, customShareForInsert(channelId));
    });
    insertChannels(channelsToInsert);

    res.json({
      success: true,
      message: `Đã thêm ${channelsToInsert.length} channel vào group${existingInGroup.length ? `, bỏ qua ${existingInGroup.length} channel đã có sẵn` : ""}`,
      data: {
        added: channelsToInsert.length,
        skipped: existingInGroup.length,
        used_channel_management_share: customShare == null ? managedShareByChannel.size : 0,
        duplicate_channels: existingInGroup
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi thêm channel vào group", error: error.message });
  }
};

exports.removeGroupChannel = (req, res) => {
  try {
    db.prepare("DELETE FROM group_channels WHERE id = ?").run(req.params.channelId);
    res.json({ success: true, message: "Đã xóa channel khỏi group" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa channel khỏi group", error: error.message });
  }
};
