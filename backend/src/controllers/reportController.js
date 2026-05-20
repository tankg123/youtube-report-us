const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const db = require("../config/database");
const { getChannelFromYoutube, getChannelsFromYoutube, getQuotaStatus } = require("../services/youtubeService");
const { generateGroupReconciliationExcel } = require("../services/reconciliationTemplateService");

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

function parseMoney(value) {
  const clean = String(value || "").replace(/[^0-9.-]/g, "");
  return Number(clean || 0);
}

function normalizeRows(rows) {
  if (!rows.length) return [];

  const header = rows[0].map((cell) => String(cell || "").toLowerCase());
  let channelIndex = header.findIndex((cell) => cell.includes("channel") && cell.includes("id"));
  let revenueIndex = header.findIndex((cell) => cell.includes("revenue") || cell.includes("doanh"));
  const dataRows = channelIndex >= 0 && revenueIndex >= 0 ? rows.slice(1) : rows;

  if (channelIndex < 0) channelIndex = 0;
  if (revenueIndex < 0) revenueIndex = 1;

  const totals = new Map();

  for (const row of dataRows) {
    const channelId = normalizeChannelId(row[channelIndex]);
    const revenue = parseMoney(row[revenueIndex]);

    if (channelId) {
      totals.set(channelId, (totals.get(channelId) || 0) + revenue);
    }
  }

  return [...totals.entries()].map(([channel_id, revenue]) => ({ channel_id, revenue }));
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
  const row = db.prepare(`
    SELECT COALESCE(SUM(cr.revenue), 0) AS total_revenue
    FROM group_channels gc
    LEFT JOIN (
      SELECT channel_id, month, SUM(revenue) AS revenue
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
  const channels = db.prepare(`
    SELECT gc.id AS group_channel_id, gc.custom_share, gc.channel_id AS group_channel_ref,
           c.*, COALESCE(cr.revenue, 0) AS revenue, cr.network_name
    FROM group_channels gc
    LEFT JOIN channels c ON c.channel_id = gc.channel_id
    LEFT JOIN (
      SELECT
        cr.channel_id,
        cr.month,
        SUM(cr.revenue) AS revenue,
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
      revenue_usd: revenueUsd,
      revenue: revenueUsd * conversion.factor,
      applied_share: rate
    };
  });

  const totalRevenueUsd = channels.reduce((sum, channel) => sum + Number(channel.revenue_usd || 0), 0);
  const totalRevenueConverted = totalRevenueUsd * conversion.factor;
  const defaultRate = tierRate(group.tiers, totalRevenueConverted);
  const channelRows = channels.map((channel) => {
    const rate = channel.applied_share == null ? defaultRate : channel.applied_share;
    const shareAmountUsd = Number(channel.revenue_usd || 0) * rate / 100;
    return {
      ...channel,
      applied_share: rate,
      revenue: Number(channel.revenue_usd || 0),
      revenue_converted: Number(channel.revenue_usd || 0) * conversion.factor,
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
      usd_to_gbp: conversion.rate?.usd_to_gbp || 0
    },
    channels: channelRows,
    summary: {
      total_revenue: totalRevenueUsd,
      total_revenue_usd: totalRevenueUsd,
      total_revenue_converted: totalRevenueConverted,
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

async function sendExcelExport(res, detail, company) {
  const buffer = await generateGroupReconciliationExcel(detail, company);
  const fileName = `${safeFileName(detail.group_name || "group")}-${detail.month || "report"}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(buffer);
}

async function sendPdfExport(res, detail, company, options = {}) {
  const currency = detail.currency || "USD";
  const fileName = `${safeFileName(detail.group_name || "group")}-${detail.month || "invoice"}.pdf`;

  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const regularFont = fs.existsSync("C:\\Windows\\Fonts\\arial.ttf") ? "C:\\Windows\\Fonts\\arial.ttf" : "Helvetica";
  const boldFont = fs.existsSync("C:\\Windows\\Fonts\\arialbd.ttf") ? "C:\\Windows\\Fonts\\arialbd.ttf" : "Helvetica-Bold";
  if (regularFont !== "Helvetica") doc.registerFont("AppRegular", regularFont);
  if (boldFont !== "Helvetica-Bold") doc.registerFont("AppBold", boldFont);
  const regular = regularFont === "Helvetica" ? "Helvetica" : "AppRegular";
  const boldPdf = boldFont === "Helvetica-Bold" ? "Helvetica-Bold" : "AppBold";

  const green = "#17715f";
  const lightGreen = "#82c94e";
  const dark = "#2c2f35";
  const gray = "#747b86";
  const logoPath = path.resolve(__dirname, "../../templates/ans-logo.png");
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const sideW = 164;
  const mainX = sideW + 48;

  doc.rect(0, 0, sideW, pageH).fill(green);
  if (fs.existsSync(logoPath)) {
    doc.roundedRect(24, 36, 116, 72, 10).fill("white");
    doc.image(logoPath, 34, 46, { fit: [96, 52], align: "center", valign: "center" });
  } else {
    doc.fillColor("white").font(boldPdf).fontSize(22).text("ANS\nNetwork", 30, 42, { lineGap: 2 });
  }
  doc.fontSize(10).text(`Invoice# ${detail.month || ""}-${detail.id}`, 28, 170);
  doc.text(`Invoice Date: ${new Date().toLocaleDateString("en-GB")}`, 28, 190);
  doc.text(`Account: ${detail.account_number || "-"}`, 28, 210);
  doc.save().rotate(-90, { origin: [58, 460] }).fontSize(48).text("I N V O I C E", -475, 35).restore();
  doc.fontSize(9).text("Phone", 28, 610).font(regular).text(company.phone || "-", 28, 625);
  doc.font(boldPdf).text("E-mail", 28, 650).font(regular).text(company.email || "-", 28, 665, { width: 112 });
  doc.font(boldPdf).text("Address", 28, 692).font(regular).text(company.address || "-", 28, 707, { width: 112 });
  doc.font(boldPdf).text("TERM & CONDITIONS", 28, 760).font(regular).text("Revenue reconciliation for YouTube channels, subject to monthly exchange rate and agreed partner share.", 28, 778, { width: 112, lineGap: 2 });

  doc.fillColor(dark);
  doc.font(regular).fontSize(10).fillColor(gray).text("Invoice From,", mainX, 58);
  doc.font(boldPdf).fontSize(18).fillColor(dark).text(company.company_name || "-", mainX, 78, { width: 150 });
  doc.fontSize(10).text("Phone", mainX, 132).font(regular).text(company.phone || "-", mainX, 148);
  doc.font(boldPdf).text("E-mail", mainX, 170).font(regular).text(company.email || "-", mainX, 186, { width: 150 });
  doc.font(boldPdf).text("Address", mainX, 208).font(regular).text(company.address || "-", mainX, 224, { width: 150 });

  const rightX = 386;
  doc.font(regular).fontSize(10).fillColor(gray).text("Invoice To,", rightX, 58);
  doc.font(boldPdf).fontSize(18).fillColor(dark).text(detail.partner_name || "-", rightX, 78, { width: 150 });
  doc.fontSize(10).text("Phone", rightX, 132).font(regular).text(detail.phone || "-", rightX, 148);
  doc.font(boldPdf).text("E-mail", rightX, 170).font(regular).text(detail.email || "-", rightX, 186, { width: 150 });
  doc.font(boldPdf).text("Address", rightX, 208).font(regular).text(detail.address || "-", rightX, 224, { width: 150 });

  let y = 292;
  const tableX = mainX - 70;
  const tableW = pageW - tableX - 36;
  doc.rect(tableX, y, tableW, 24).fill(lightGreen);
  doc.fillColor("white").font(boldPdf).fontSize(10);
  doc.text("ITEM DESCRIPTIONS", tableX + 70, y + 8);
  doc.text("QTY", tableX + 280, y + 8);
  doc.text("PRICE", tableX + 350, y + 8);
  doc.text("TOTAL", tableX + 430, y + 8);
  y += 40;

  doc.fillColor(dark).fontSize(10);
  detail.channels.slice(0, 8).forEach((channel) => {
    doc.font(boldPdf).text(channel.title || channel.channel_id || "Channel", tableX, y, { width: 250 });
    doc.font(regular).fillColor(gray).fontSize(8).text(channel.channel_id || "", tableX, y + 15, { width: 250 });
    doc.fillColor(dark).font(regular).fontSize(10).text(`${Number(channel.applied_share || 0)}%`, tableX + 288, y + 8, { width: 45, align: "center" });
    doc.text(moneyText(channel.revenue_usd || 0, "USD"), tableX + 335, y + 8, { width: 70, align: "right" });
    doc.text(moneyText(channel.paid ?? channel.share_amount_converted ?? 0, currency), tableX + 410, y + 8, { width: 90, align: "right" });
    y += 54;
  });

  const summaryY = Math.min(y + 8, 600);
  doc.font(boldPdf).fontSize(11).fillColor(dark);
  doc.text("SUB TOTAL", mainX, summaryY).text(moneyText(detail.summary.paid_converted || 0, currency), mainX + 145, summaryY, { width: 90, align: "right" });
  doc.text(`FEE (${Number(detail.summary.fee_rate || 0)}%)`, mainX, summaryY + 18).text(moneyText(detail.summary.fee_converted || 0, currency), mainX + 145, summaryY + 18, { width: 90, align: "right" });
  doc.text("DISCOUNT", mainX, summaryY + 36).text(moneyText(0, currency), mainX + 145, summaryY + 36, { width: 90, align: "right" });
  doc.text("GRAND TOTAL", mainX, summaryY + 54).text(moneyText(detail.summary.payable_converted || 0, currency), mainX + 145, summaryY + 54, { width: 90, align: "right" });
  doc.rect(408, summaryY + 10, 128, 52).fill(lightGreen);
  doc.fillColor("white").fontSize(24).text(moneyText(detail.summary.payable_converted || 0, currency), 414, summaryY + 25, { width: 116, align: "center" });

  doc.moveTo(mainX, summaryY + 90).lineTo(548, summaryY + 90).lineWidth(1.5).strokeColor(dark).stroke();
  doc.fillColor(dark).font(boldPdf).fontSize(12).text("PAYMENT INFO", mainX, summaryY + 112);
  doc.fontSize(9).text("Account Us", mainX, summaryY + 145).font(regular).text(company.account_number || "-", mainX, summaryY + 160);
  doc.font(boldPdf).text("A/C Name", mainX, summaryY + 182).font(regular).text(company.company_name || "-", mainX, summaryY + 197);
  doc.font(boldPdf).text("Bank Details", mainX, summaryY + 219).font(regular).text(company.bank_name || "-", mainX, summaryY + 234, { width: 150 });

  doc.font(boldPdf).fontSize(12).text("PAYMENT INFO", rightX, summaryY + 112);
  doc.fontSize(9).text("Account Us", rightX, summaryY + 145).font(regular).text(detail.account_number || "-", rightX, summaryY + 160);
  doc.font(boldPdf).text("A/C Name", rightX, summaryY + 182).font(regular).text(detail.partner_name || "-", rightX, summaryY + 197);
  doc.font(boldPdf).text("Bank Details", rightX, summaryY + 219).font(regular).text(detail.bank_name || detail.pingpongx || "-", rightX, summaryY + 234, { width: 150 });

  doc.rect(sideW, pageH - 36, pageW - sideW, 36).fill(lightGreen);
  doc.fillColor("white").font(boldPdf).fontSize(18).text("T H A N K S  Y O U R  B U S I N E S S", sideW + 38, pageH - 25);
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

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
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
      INSERT INTO channel_revenues (month, network_id, channel_id, revenue, source_file, import_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(month, network_id, channel_id) DO UPDATE SET
        revenue = excluded.revenue,
        source_file = excluded.source_file,
        import_id = excluded.import_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    const missingChannels = rows.filter((row) => !foundIds.has(row.channel_id)).map((row) => row.channel_id);
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);

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
        saveRevenue.run(month, network.id, row.channel_id, row.revenue, fileName || "", importId);
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
        total_revenue: totalRevenue
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
        total_revenue: rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0)
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
  let revenueUsd = 0;
  let paidUsd = 0;
  let feeUsd = 0;

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

      const partnerId = detail.partner_id;
      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, {
          partner_id: partnerId,
          partner_name: detail.display_name || detail.partner_name || "-",
          revenue_usd: 0,
          paid_usd: 0,
          profit_usd: 0,
          channels: new Set()
        });
      }

      const partner = partnerMap.get(partnerId);
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
    top_partners: topPartners
  };
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
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load report dashboard", error: error.message });
  }
};

exports.getNetworks = (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM networks ORDER BY updated_at DESC, id DESC").all();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy network", error: error.message });
  }
};

exports.createNetwork = (req, res) => {
  try {
    const data = req.body || {};
    const name = String(data.name || "").trim();

    if (!name) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên network" });
    }

    const result = db.prepare(`
      INSERT INTO networks (name, description)
      VALUES (?, ?)
    `).run(name, data.description || "");

    res.json({ success: true, message: "Đã tạo network", data: db.prepare("SELECT * FROM networks WHERE id = ?").get(result.lastInsertRowid) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tạo network", error: error.message });
  }
};

exports.updateNetwork = (req, res) => {
  try {
    const data = req.body || {};
    const name = String(data.name || "").trim();

    if (!name) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên network" });
    }

    db.prepare(`
      UPDATE networks
      SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, data.description || "", req.params.id);

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
    const rows = db.prepare("SELECT * FROM partners ORDER BY updated_at DESC, id DESC").all();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy partner", error: error.message });
  }
};

exports.createPartner = (req, res) => {
  try {
    const data = req.body || {};
    if (!String(data.partner_name || "").trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập Partner Name" });
    }

    const result = db.prepare(`
      INSERT INTO partners (
        partner_name, display_name, email, contact_name, phone, counter_email,
        address, pingpongx, bank_name, account_number, internal_notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.partner_name,
      data.display_name || "",
      data.email || "",
      data.contact_name || "",
      data.phone || "",
      data.counter_email || "",
      data.address || "",
      data.pingpongx || "",
      data.bank_name || "",
      data.account_number || "",
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
    db.prepare(`
      UPDATE partners SET
        partner_name = ?, display_name = ?, email = ?, contact_name = ?, phone = ?,
        counter_email = ?, address = ?, pingpongx = ?, bank_name = ?,
        account_number = ?, internal_notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.partner_name,
      data.display_name || "",
      data.email || "",
      data.contact_name || "",
      data.phone || "",
      data.counter_email || "",
      data.address || "",
      data.pingpongx || "",
      data.bank_name || "",
      data.account_number || "",
      data.internal_notes || "",
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
    const groups = db.prepare(`
      SELECT g.*, p.partner_name, COUNT(gc.id) AS channel_count
      FROM channel_groups g
      JOIN partners p ON p.id = g.partner_id
      LEFT JOIN group_channels gc ON gc.group_id = g.id
      GROUP BY g.id
      ORDER BY g.updated_at DESC, g.id DESC
    `).all().map(parseGroup).map((group) => {
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
      INSERT INTO channel_groups (partner_id, group_name, currency, fee_rate, description, tiers)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.partner_id, data.group_name, normalizeCurrency(data.currency), Number(data.fee_rate || 0), data.description || "", JSON.stringify(data.tiers || []));

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
        description = ?, tiers = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.partner_id, data.group_name, normalizeCurrency(data.currency), Number(data.fee_rate || 0), data.description || "", JSON.stringify(data.tiers || []), req.params.id);

    res.json({ success: true, message: "Đã cập nhật group" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi cập nhật group", error: error.message });
  }
};

exports.deleteGroup = (req, res) => {
  try {
    db.prepare("DELETE FROM group_channels WHERE group_id = ?").run(req.params.id);
    db.prepare("DELETE FROM channel_groups WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Đã xóa group" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa group", error: error.message });
  }
};

exports.getGroupDetail = (req, res) => {
  try {
    const detail = groupDetail(req.params.id, String(req.query.month || ""));
    if (!detail) return res.status(404).json({ success: false, message: "Không tìm thấy group" });
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy chi tiết group", error: error.message });
  }
};

exports.exportGroupExcel = async (req, res) => {
  try {
    const detail = groupDetail(req.params.id, String(req.body?.month || req.query.month || ""));
    if (!detail) return res.status(404).json({ success: false, message: "Group not found" });
    await sendExcelExport(res, detail, selectedCompany(req.body?.company_id || req.query.company_id));
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not export Excel", error: error.message });
  }
};

exports.exportGroupPdf = async (req, res) => {
  try {
    const detail = groupDetail(req.params.id, String(req.body?.month || req.query.month || ""));
    if (!detail) return res.status(404).json({ success: false, message: "Group not found" });
    await sendPdfExport(res, detail, selectedCompany(req.body?.company_id || req.query.company_id), {
      base64: Boolean(req.body?.return_base64 || req.query.return_base64)
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

    const youtubeChannels = await getChannelsFromYoutube(directIds);
    for (const channel of youtubeChannels) upsertChannel(channel);

    const uniqueChannels = [...new Set(resolvedIds)];
    const foundDirectIds = new Set(youtubeChannels.map((channel) => channel.channel_id));
    const missingDirectIds = directIds.filter((channelId) => !foundDirectIds.has(channelId));
    for (const channelId of missingDirectIds) {
      upsertPlaceholderChannel(channelId, "Không lấy được dữ liệu từ YouTube khi thêm vào group");
    }
    const customShare = revenue_share === "" || revenue_share == null ? null : Number(revenue_share);

    if (customShare != null && (Number.isNaN(customShare) || customShare < 0 || customShare > 100)) {
      return res.status(400).json({ success: false, message: "Revenue share phải nằm trong khoảng 0% đến 100%" });
    }

    const appliedShare = customShare == null ? groupDefaultShare(req.params.id, month || "") : customShare;
    const invalidChannels = uniqueChannels
      .map((channelId) => {
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
      ON CONFLICT(group_id, channel_id) DO UPDATE SET custom_share = excluded.custom_share
    `);

    for (const channelId of uniqueChannels) stmt.run(req.params.id, channelId, customShare);

    res.json({ success: true, message: "Đã thêm channel vào group", data: { added: uniqueChannels.length } });
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
