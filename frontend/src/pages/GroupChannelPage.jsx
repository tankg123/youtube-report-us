import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpDown, Calendar, Check, Copy, Download, Edit3, Loader2, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Users, X } from "lucide-react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";

const emptyGroup = {
  partner_id: "",
  group_name: "",
  currency: "USD",
  fee_rate: 0,
  description: "",
  tiers: []
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function money(value, currency = "USD") {
  const normalized = ["VND", "GBP", "USD"].includes(String(currency).toUpperCase())
    ? String(currency).toUpperCase()
    : "USD";
  const locale = normalized === "VND" ? "vi-VN" : normalized === "GBP" ? "en-GB" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalized,
    maximumFractionDigits: normalized === "VND" ? 0 : 2
  }).format(Number(value || 0));
}

function SortButton({ label, active, direction, onClick, align = "left" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-black hover:bg-slate-100",
        active ? "text-blue-700 bg-blue-50" : "text-slate-500",
        align === "right" ? "ml-auto justify-end" : ""
      ].join(" ")}
      title={`Sort ${label} ${active && direction === "asc" ? "Z-A" : "A-Z"}`}
    >
      <span>{label}</span>
      <ArrowUpDown size={9} />
    </button>
  );
}

function usd(value) {
  return money(value, "USD");
}

function converted(value, currency = "USD") {
  return money(value, currency);
}

function monthLabel(month) {
  if (!month) return "Select month";
  const [year, value] = month.split("-");
  return new Date(Number(year), Number(value) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MonthPicker({ month, onChange }) {
  const selected = month || currentMonth();
  const [year, setYear] = useState(Number(selected.slice(0, 4)));

  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between bg-slate-100 rounded-xl px-3 py-2 mb-3">
        <button type="button" onClick={() => setYear(year - 1)} className="w-8 h-8 rounded-lg hover:bg-white font-black">{"<"}</button>
        <span className="font-black text-slate-900">{year}</span>
        <button type="button" onClick={() => setYear(year + 1)} className="w-8 h-8 rounded-lg hover:bg-white font-black">{">"}</button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {monthNames.map((name, index) => {
          const value = `${year}-${String(index + 1).padStart(2, "0")}`;
          const active = value === month;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(value)}
              className={[
                "rounded-xl px-3 py-2 text-sm font-bold border",
                active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              ].join(" ")}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
        <button type="button" onClick={() => onChange(currentMonth())} className="text-sm font-bold text-slate-500 hover:text-slate-900">Clear</button>
        <button type="button" onClick={() => onChange(currentMonth())} className="text-sm font-bold text-blue-600">This month</button>
      </div>
    </div>
  );
}

function plainNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function sanitizeFileName(value) {
  return String(value || "export").replace(/[\\/:*?"<>|]+/g, "-").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xml(value) {
  return escapeHtml(value);
}

function xlsCell(value = "", style = "sDefault", type = "String", mergeAcross = 0) {
  const merge = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : "";
  if (type === "Number") {
    return `<Cell ss:StyleID="${style}"${merge}><Data ss:Type="Number">${Number(value || 0)}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="${style}"${merge}><Data ss:Type="String">${xml(value)}</Data></Cell>`;
}

function xlsRow(cells, height) {
  const h = height ? ` ss:Height="${height}"` : "";
  return `<Row${h}>${cells.join("")}</Row>`;
}

function downloadBlob(content, type, fileName) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function columnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function xlsxText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xlsxCell(rowIndex, colIndex, cell) {
  const ref = `${columnName(colIndex)}${rowIndex}`;
  const style = cell.s ? ` s="${cell.s}"` : "";
  if (cell.t === "n") {
    return `<c r="${ref}"${style}><v>${Number(cell.v || 0)}</v></c>`;
  }
  return `<c r="${ref}"${style} t="inlineStr"><is><t>${xlsxText(cell.v)}</t></is></c>`;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function dateToDos(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function pushUInt16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUInt32(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, day } = dateToDos();

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);
    const local = [];
    pushUInt32(local, 0x04034b50);
    pushUInt16(local, 20);
    pushUInt16(local, 0);
    pushUInt16(local, 0);
    pushUInt16(local, time);
    pushUInt16(local, day);
    pushUInt32(local, crc);
    pushUInt32(local, data.length);
    pushUInt32(local, data.length);
    pushUInt16(local, nameBytes.length);
    pushUInt16(local, 0);
    chunks.push(new Uint8Array(local), nameBytes, data);

    const center = [];
    pushUInt32(center, 0x02014b50);
    pushUInt16(center, 20);
    pushUInt16(center, 20);
    pushUInt16(center, 0);
    pushUInt16(center, 0);
    pushUInt16(center, time);
    pushUInt16(center, day);
    pushUInt32(center, crc);
    pushUInt32(center, data.length);
    pushUInt32(center, data.length);
    pushUInt16(center, nameBytes.length);
    pushUInt16(center, 0);
    pushUInt16(center, 0);
    pushUInt16(center, 0);
    pushUInt16(center, 0);
    pushUInt32(center, 0);
    pushUInt32(center, offset);
    central.push(new Uint8Array(center), nameBytes);
    offset += local.length + nameBytes.length + data.length;
  });

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = [];
  pushUInt32(end, 0x06054b50);
  pushUInt16(end, 0);
  pushUInt16(end, 0);
  pushUInt16(end, files.length);
  pushUInt16(end, files.length);
  pushUInt32(end, centralSize);
  pushUInt32(end, offset);
  pushUInt16(end, 0);

  return new Blob([...chunks, ...central, new Uint8Array(end)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function makeXlsx({ sheetName, rows, merges, widths }) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.cells.map((cell, colIndex) => xlsxCell(rowIndex + 1, colIndex + 1, cell)).join("");
    const height = row.height ? ` ht="${row.height}" customHeight="1"` : "";
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
  }).join("");
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "";
  const safeSheetName = xlsxText(sheetName.replace(/[\[\]:*?/\\]/g, "-").slice(0, 31) || "Invoice");

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <sheetViews><sheetView showGridLines="1" zoomScale="85" workbookViewId="0"/></sheetViews>
 <sheetFormatPr defaultRowHeight="18" baseColWidth="10"/>
 <cols>${cols}</cols>
 <sheetData>${sheetRows}</sheetData>
 ${mergeXml}
 <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
 <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheets><sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>
 <fonts count="5"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><b/><color rgb="FF1F4E79"/><sz val="10"/><name val="Calibri"/></font><font><sz val="10"/><name val="Calibri"/></font></fonts>
 <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1FB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F8FF"/><bgColor indexed="64"/></patternFill></fill></fills>
 <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB8C7DC"/></left><right style="thin"><color rgb="FFB8C7DC"/></right><top style="thin"><color rgb="FFB8C7DC"/></top><bottom style="thin"><color rgb="FFB8C7DC"/></bottom><diagonal/></border></borders>
 <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
 <cellXfs count="15">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1"/>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  <xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
 </cellXfs>
 <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  return makeZip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: stylesXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml }
  ]);
}

const fallbackCompany = {
  company_name: "OHENE MEDIA SYSTEMS UK LTD",
  email: "Admin@amnhacso.com",
  phone: "(+44) 744 64 64 679",
  address: "2A Connaught Avenue, London, United Kingdom",
  representative_name: "Nguyen Van Tan",
  representative_position: "Director",
  bank_name: "",
  account_number: "",
  tax_code: ""
};

function exportGroupExcel(group, company = fallbackCompany) {
  if (!group) return;

  const currency = group.currency || "USD";
  const factor = Number(group.exchange_rate?.factor || 1);
  const titleMonth = monthLabel(group.month);
  const paidLabel = `Paid ${currency}`;
  const channels = group.channels || [];
  const totalRevenueUsd = channels.reduce((sum, channel) => sum + Number(channel.revenue_usd ?? channel.revenue ?? 0), 0);
  const totalShareUsd = channels.reduce((sum, channel) => sum + Number(channel.share_amount || 0), 0);
  const totalPaid = channels.reduce((sum, channel) => sum + Number(channel.paid ?? channel.share_amount_converted ?? channel.share_amount ?? 0), 0);
  const paidStyle = currency === "VND" ? 11 : 10;
  const totalPaidStyle = currency === "VND" ? 14 : 13;
  const sheetName = sanitizeFileName(group.partner_name || group.group_name || "Invoice").slice(0, 31) || "Invoice";
  const c = (v = "", s = 0, t = "s") => ({ v, s, t });
  const blank = (s = 0) => c("", s);
  const row = (cells, height = 18) => ({ cells, height });
  const emptyCells = (count, style = 0) => Array.from({ length: count }, () => blank(style));

  const rows = [
    row([c("SOCIALIST REPUBLIC OF VIETNAM", 1), ...emptyCells(8)], 18),
    row([c("Independence - Freedom - Happiness", 2), ...emptyCells(8)], 18),
    row([c("----- o0o -----", 2), ...emptyCells(8)], 18),
    row([c(`YOUTUBE RECONCILIATION MINUTES ${titleMonth}`, 3), ...emptyCells(8)], 24),
    row(emptyCells(9), 18),
    row([c(`Party A: ${company.company_name || fallbackCompany.company_name}`, 4), ...emptyCells(8, 4)], 18),
    row([c("Address", 5), c(company.address || "-", 6), ...emptyCells(7)], 18),
    row([c("Phone / Email", 5), c(`${company.phone || "-"} / ${company.email || "-"}`, 6), ...emptyCells(7)], 18),
    row([c("Representative", 5), c(company.representative_name || "-", 6), ...emptyCells(4), c(`Position: ${company.representative_position || "-"}`, 6), ...emptyCells(2)], 18),
    row([c(`Party B: ${group.partner_name || "-"}`, 4), ...emptyCells(8, 4)], 18),
    row([c("Address", 5), c(group.address || "-", 6), ...emptyCells(7)], 18),
    row([c("Phone", 5), ...emptyCells(7), c(group.phone || "-", 7)], 18),
    row([c("Email", 5), c(group.email || "-", 6), ...emptyCells(7)], 18),
    row([c("Bank details", 5), c(`- | Account: ${group.account_number || "-"} | PingPongX: ${group.pingpongx || "-"} | Counter: ${group.counter_email || group.email || "-"}`, 6), ...emptyCells(7)], 18),
    row([c("Exchange month description", 5), ...emptyCells(3), c(`1 USD = ${plainNumber(factor, currency === "VND" ? 0 : 2)} ${currency}`, 6), ...emptyCells(4)], 18),
    row([c("No.", 8), c("Channel Name", 8), c("Channel ID", 8), c("Network", 8), c("Total Channel Revenue (USD)", 8), c("Share", 8), c("Share Amount USD", 8), c(paidLabel, 8), c("Notes", 8)], 20),
    ...channels.map((channel, index) => row([
      c(index + 1, 9, "n"),
      c(channel.title || "Channel error / die", 6),
      c(channel.channel_id || "", 6),
      c(channel.network_name || group.network_name || "-", 6),
      c(channel.revenue_usd ?? channel.revenue ?? 0, 10, "n"),
      c(`${plainNumber(channel.applied_share || 0, 0)}%`, 7),
      c(channel.share_amount || 0, 10, "n"),
      c(channel.paid ?? channel.share_amount_converted ?? channel.share_amount ?? 0, paidStyle, "n"),
      blank(6)
    ], 19)),
    row([c("Total", 12), ...emptyCells(3, 12), c(totalRevenueUsd, 13, "n"), blank(12), c(totalShareUsd, 13, "n"), c(totalPaid, totalPaidStyle, "n"), blank(12)], 19),
    row([c(`Fee (${plainNumber(group.summary?.fee_rate ?? group.fee_rate ?? 0, 2)}%)`, 12), ...emptyCells(6, 12), c(group.summary?.fee_converted ?? 0, totalPaidStyle, "n"), blank(12)], 19),
    row([c(`Total Payable ${currency}`, 12), ...emptyCells(6, 12), c(group.summary?.payable_converted ?? group.summary?.paid_converted ?? totalPaid, totalPaidStyle, "n"), blank(12)], 19)
  ];

  const blob = makeXlsx({
    sheetName,
    rows,
    widths: [8, 44, 72, 20, 60, 14, 42, 28, 14],
    merges: [
      "A1:I1", "A2:I2", "A3:I3", "A4:I4",
      "A6:I6", "B7:I7", "B8:I8", "B9:F9", "G9:I9",
      "A10:I10", "B11:I11", "B13:I13", "B14:I14", "E15:I15",
      `A${17 + channels.length}:D${17 + channels.length}`,
      `A${18 + channels.length}:G${18 + channels.length}`,
      `A${19 + channels.length}:G${19 + channels.length}`
    ]
  });

  downloadBlob(blob, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${sanitizeFileName(group.group_name)}-${group.month || "report"}.xlsx`);
}

function exportGroupPdf(group, company = fallbackCompany) {
  if (!group) return;
  const currency = group.currency || "USD";
  const payable = group.summary?.payable_converted ?? group.summary?.paid_converted ?? 0;
  const paid = group.summary?.paid_converted ?? 0;
  const fee = group.summary?.fee_converted ?? 0;
  const invoiceNumber = `${group.month || currentMonth()}-${String(group.id || "").padStart(3, "0")}`;
  const rows = (group.channels || []).map((channel, index) => `
    <tr>
      <td>
        <strong>${escapeHtml(channel.title || channel.channel_id)}</strong>
        <p>${escapeHtml(channel.channel_id || "")}</p>
      </td>
      <td class="center">${plainNumber(channel.applied_share || 0, 0)}%</td>
      <td class="num">${usd(channel.revenue_usd ?? channel.revenue)}</td>
      <td class="num">${converted(channel.paid ?? channel.share_amount_converted ?? channel.share_amount, currency)}</td>
    </tr>
  `).join("");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(group.group_name)} invoice</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #2c2f35; background: #f3f8ed; }
          .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; display: grid; grid-template-columns: 58mm 1fr; box-shadow: 0 16px 40px rgba(15,23,42,.16); }
          .side { background: #17715f; color: white; padding: 16mm 9mm; position: relative; }
          .logo { font-size: 28px; line-height: 1.05; letter-spacing: .08em; font-weight: 800; margin-bottom: 35mm; }
          .invoice-vertical { position: absolute; left: 10mm; top: 88mm; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 44px; font-weight: 900; letter-spacing: .22em; }
          .side-block { position: absolute; left: 9mm; right: 9mm; bottom: 36mm; font-size: 11px; line-height: 1.65; }
          .terms { position: absolute; left: 9mm; right: 9mm; bottom: 13mm; font-size: 10px; line-height: 1.55; }
          .terms b, .side-block b { display: block; margin-top: 7px; color: #fff; }
          .main { padding: 16mm 10mm 0 10mm; position: relative; }
          .top { display: grid; grid-template-columns: 1fr 1fr; gap: 16mm; margin-bottom: 20mm; }
          .party-label { color: #767b85; font-size: 11px; margin-bottom: 5px; }
          h1 { margin: 0 0 8px; font-size: 25px; letter-spacing: .03em; color: #2c2f35; }
          h2 { margin: 0 0 8px; font-size: 22px; color: #2c2f35; }
          .info { font-size: 11px; line-height: 1.65; }
          .info b { display: block; color: #101827; margin-top: 7px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #82c94e; color: white; font-size: 11px; letter-spacing: .03em; padding: 9px 8px; text-transform: uppercase; border-right: 3px solid white; }
          th:last-child { border-right: 0; }
          td { padding: 11px 8px; font-size: 11px; vertical-align: top; border-bottom: 1px solid #edf1f4; }
          td strong { font-size: 12px; color: #222831; }
          td p { margin: 4px 0 0; color: #7b828c; font-size: 10px; line-height: 1.5; }
          .center { text-align: center; }
          .num { text-align: right; white-space: nowrap; }
          .summary { display: grid; grid-template-columns: 1fr 38mm; gap: 10mm; align-items: end; margin-top: 8mm; }
          .totals { font-size: 12px; font-weight: 800; }
          .totals div { display: grid; grid-template-columns: 1fr 28mm; gap: 8px; padding: 3px 0; }
          .grand { background: #82c94e; color: white; font-size: 26px; font-weight: 900; text-align: center; padding: 12px 6px; }
          .divider { height: 2px; background: #2c2f35; margin: 8mm 0 6mm; }
          .payments { display: grid; grid-template-columns: 1fr 1fr; gap: 16mm; font-size: 11px; line-height: 1.65; }
          .payments h3 { margin: 0 0 8px; font-size: 14px; letter-spacing: .03em; }
          .payments b { display: block; margin-top: 6px; color: #20242b; }
          .thanks { position: absolute; left: 0; right: 0; bottom: 0; background: #82c94e; color: white; text-align: center; padding: 9px; font-size: 18px; font-weight: 900; letter-spacing: .28em; }
          .print-btn { position: fixed; right: 18px; top: 18px; padding: 10px 16px; border-radius: 10px; border: 0; background: #17715f; color: #fff; font-weight: 700; z-index: 10; }
          @media print { button { display:none; } }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
        <section class="sheet">
          <aside class="side">
            <div class="logo">YOUR<br>LOGO</div>
            <div>
              <b>Invoice# ${escapeHtml(invoiceNumber)}</b><br>
              <b>Invoice Date: ${escapeHtml(new Date().toLocaleDateString("en-GB"))}</b><br>
              <b>Account: ${escapeHtml(group.account_number || "-")}</b>
            </div>
            <div class="invoice-vertical">INVOICE</div>
            <div class="side-block">
              <b>Phone</b>${escapeHtml(company.phone || "-")}
              <b>E-mail</b>${escapeHtml(company.email || "-")}
              <b>Address</b>${escapeHtml(company.address || "-")}
            </div>
            <div class="terms">
              <b>TERM & CONDITIONS</b>
              Revenue reconciliation for YouTube channels, subject to monthly exchange rate and agreed partner share.
            </div>
          </aside>
          <main class="main">
            <div class="top">
              <div>
                <div class="party-label">Invoice From,</div>
                <h2>${escapeHtml(company.company_name || fallbackCompany.company_name)}</h2>
                <div class="info">
                  <b>Phone</b>${escapeHtml(company.phone || "-")}
                  <b>E-mail</b>${escapeHtml(company.email || "-")}
                  <b>Address</b>${escapeHtml(company.address || "-")}
                </div>
              </div>
              <div>
                <div class="party-label">Invoice To,</div>
                <h2>${escapeHtml(group.partner_name || "-")}</h2>
                <div class="info">
                  <b>Phone</b>${escapeHtml(group.phone || "-")}
                  <b>E-mail</b>${escapeHtml(group.email || "-")}
                  <b>Address</b>${escapeHtml(group.address || "-")}
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr><th>Item Descriptions</th><th>Qty</th><th>Price</th><th>Total</th></tr>
              </thead>
              <tbody>${rows || "<tr><td colspan='4'>No channels.</td></tr>"}</tbody>
            </table>

            <div class="summary">
              <div class="totals">
                <div><span>SUB TOTAL</span><span>${converted(paid, currency)}</span></div>
                <div><span>FEE (${plainNumber(group.summary?.fee_rate ?? group.fee_rate ?? 0, 2)}%)</span><span>${converted(fee, currency)}</span></div>
                <div><span>DISCOUNT</span><span>${converted(0, currency)}</span></div>
                <div><span>GRAND TOTAL</span><span>${converted(payable, currency)}</span></div>
              </div>
              <div class="grand">${converted(payable, currency)}</div>
            </div>

            <div class="divider"></div>
            <div class="payments">
              <div>
                <h3>PAYMENT INFO</h3>
                <b>Account Us</b>${escapeHtml(company.account_number || "-")}
                <b>A/C Name</b>${escapeHtml(company.company_name || "-")}
                <b>Bank Details</b>${escapeHtml(company.bank_name || "-")}
              </div>
              <div>
                <h3>PAYMENT INFO</h3>
                <b>Account Us</b>${escapeHtml(group.account_number || "-")}
                <b>A/C Name</b>${escapeHtml(group.partner_name || "-")}
                <b>Bank Details</b>${escapeHtml(group.bank_name || group.pingpongx || "-")}
              </div>
            </div>
            <div class="thanks">THANKS YOUR BUSINESS</div>
          </main>
        </section>
      </body>
    </html>
  `;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function GroupForm({ partners, value, onChange }) {
  const sortedPartners = useMemo(() => [...(partners || [])].sort((left, right) =>
    String(left.display_name || left.partner_name || "").localeCompare(String(right.display_name || right.partner_name || ""), "vi", { sensitivity: "base" })
  ), [partners]);

  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-2 gap-4">
        <label>
          <span className="text-xs font-black uppercase text-slate-400 mb-2 block">Partner</span>
          <select value={value.partner_id} onChange={(e) => onChange({ ...value, partner_id: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3 bg-white">
            <option value="">Chọn partner</option>
            {sortedPartners.map((partner) => (
              <option key={partner.id} value={partner.id}>{partner.display_name || partner.partner_name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-black uppercase text-slate-400 mb-2 block">Tên group</span>
          <input value={value.group_name} onChange={(e) => onChange({ ...value, group_name: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="Tên hiển thị group" />
        </label>
        <label>
          <span className="text-xs font-black uppercase text-slate-400 mb-2 block">Type rate</span>
          <select value={value.currency} onChange={(e) => onChange({ ...value, currency: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3 bg-white">
            <option value="USD">USD</option>
            <option value="VND">VND</option>
            <option value="GBP">GBP</option>
          </select>
        </label>
        <label>
          <span className="text-xs font-black uppercase text-slate-400 mb-2 block">Fee (%)</span>
          <input type="number" min="0" max="100" step="0.01" value={value.fee_rate ?? 0} onChange={(e) => onChange({ ...value, fee_rate: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="0" />
        </label>
        <label>
          <span className="text-xs font-black uppercase text-slate-400 mb-2 block">Mô tả</span>
          <input value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="Mô tả ngắn về group này..." />
        </label>
      </div>

      <div className="border border-slate-200 rounded-3xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-900">Revenue tiers</h3>
            <p className="text-xs text-slate-500">Có thể bỏ trống nếu group không dùng tier.</p>
          </div>
          <button type="button" onClick={() => onChange({ ...value, tiers: [...value.tiers, { min: 0, max: 0, rate: 0 }] })} className="px-3 py-2 rounded-xl bg-white border border-slate-200 font-bold text-sm flex items-center gap-2">
            <Plus size={15} />
            Thêm tier
          </button>
        </div>
        <div className="p-4 space-y-3">
          {value.tiers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Group này chưa dùng tier. Bấm Thêm tier khi cần.
            </div>
          ) : value.tiers.map((tier, index) => (
            <div key={index} className="grid grid-cols-[26px_1fr_1fr_1fr_34px] gap-3 items-end">
              <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-black flex items-center justify-center">{index + 1}</span>
              <label>
                <span className="text-xs font-black uppercase text-slate-400">Min Revenue</span>
                <input type="number" value={tier.min} onChange={(e) => {
                  const tiers = [...value.tiers];
                  tiers[index] = { ...tier, min: e.target.value };
                  onChange({ ...value, tiers });
                }} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label>
                <span className="text-xs font-black uppercase text-slate-400">Max Revenue</span>
                <input type="number" value={tier.max} onChange={(e) => {
                  const tiers = [...value.tiers];
                  tiers[index] = { ...tier, max: e.target.value };
                  onChange({ ...value, tiers });
                }} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <label>
                <span className="text-xs font-black uppercase text-slate-400">Share Rate</span>
                <input type="number" value={tier.rate} onChange={(e) => {
                  const tiers = [...value.tiers];
                  tiers[index] = { ...tier, rate: e.target.value };
                  onChange({ ...value, tiers });
                }} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              </label>
              <button type="button" onClick={() => onChange({ ...value, tiers: value.tiers.filter((_, tierIndex) => tierIndex !== index) })} className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GroupChannelPage() {
  const { canViewReports } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(currentMonth());
  const [partners, setPartners] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [groupForm, setGroupForm] = useState(emptyGroup);
  const [editing, setEditing] = useState(null);
  const [groupModal, setGroupModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [channelInputs, setChannelInputs] = useState("");
  const [revenueShare, setRevenueShare] = useState("");
  const [loadingPartnerChannels, setLoadingPartnerChannels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [includeSignatureBoxes, setIncludeSignatureBoxes] = useState(false);
  const [groupListCollapsed, setGroupListCollapsed] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSortDirection, setGroupSortDirection] = useState("asc");
  const [channelSort, setChannelSort] = useState({ key: "channel", direction: "asc" });
  const [channelSearch, setChannelSearch] = useState("");
  const queryGroupId = searchParams.get("group_id");
  const queryMonth = searchParams.get("month");

  function toggleChannelSort(key) {
    setChannelSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  const sortedDetailChannels = useMemo(() => {
    const keyword = channelSearch.trim().toLowerCase();
    const rows = [...(detail?.channels || [])].filter((channel) => {
      if (!keyword) return true;
      return [
        channel.title,
        channel.channel_id,
        channel.custom_url,
        channel.network_name,
        channel.status,
        channel.status_error
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
    const direction = channelSort.direction === "asc" ? 1 : -1;
    const valueOf = (channel) => {
      if (channelSort.key === "channel") return String(channel.title || channel.channel_id || "").toLowerCase();
      if (channelSort.key === "revenue") return Number(channel.revenue_usd ?? channel.revenue ?? 0);
      if (channelSort.key === "share") return Number(channel.share_amount ?? 0);
      if (channelSort.key === "paid") return Number(channel.paid ?? channel.share_amount_converted ?? channel.share_amount ?? 0);
      return "";
    };

    rows.sort((a, b) => {
      const first = valueOf(a);
      const second = valueOf(b);
      if (typeof first === "number" && typeof second === "number") return (first - second) * direction;
      return String(first).localeCompare(String(second), "en", { numeric: true }) * direction;
    });

    return rows;
  }, [detail?.channels, channelSearch, channelSort]);

  const filteredSortedGroups = useMemo(() => {
    const keyword = groupSearch.trim().toLowerCase();
    const rows = groups.filter((group) => {
      if (!keyword) return true;
      return [group.group_name, group.partner_name, group.display_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
    const direction = groupSortDirection === "asc" ? 1 : -1;
    return rows.sort((a, b) => (
      String(a.group_name || a.partner_name || "")
        .localeCompare(String(b.group_name || b.partner_name || ""), "en", { numeric: true, sensitivity: "base" }) * direction
    ));
  }, [groups, groupSearch, groupSortDirection]);

  async function fetchAll() {
    try {
      setLoading(true);
      const requests = canViewReports
        ? [api.get("/reports/partners", { params: { scope: "active" } }), api.get("/reports/groups", { params: { month } }), api.get("/reports/companies")]
        : [Promise.resolve({ data: { data: [] } }), api.get("/reports/groups", { params: { month } }), Promise.resolve({ data: { data: [] } })];
      const [partnersRes, groupsRes, companiesRes] = await Promise.all(requests);
      setPartners(partnersRes.data.data || []);
      const nextCompanies = companiesRes.data.data || [];
      setCompanies(nextCompanies);
      if (!selectedCompanyId && nextCompanies[0]) setSelectedCompanyId(String(nextCompanies[0].id));
      const nextGroups = groupsRes.data.data || [];
      setGroups(nextGroups);
      if (queryGroupId && nextGroups.some((group) => String(group.id) === String(queryGroupId))) {
        setSelectedId(queryGroupId);
      } else if (!selectedId && nextGroups[0]) {
        setSelectedId(nextGroups[0].id);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Lỗi tải group");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDetail(id = selectedId) {
    if (!id) {
      setDetail(null);
      return;
    }

    const res = await api.get(`/reports/groups/${id}`, { params: { month } });
    setDetail(res.data.data);
  }

  function openCreate() {
    setEditing(null);
    setGroupForm({ ...emptyGroup, tiers: [] });
    setGroupModal(true);
  }

  function openEdit() {
    if (!detail) return;
    setEditing(detail);
    setGroupForm({
      partner_id: detail.partner_id,
      group_name: detail.group_name,
      currency: detail.currency,
      fee_rate: detail.fee_rate ?? 0,
      description: detail.description || "",
      tiers: detail.tiers?.length ? detail.tiers : []
    });
    setGroupModal(true);
  }

  async function copyChannelId(channelId) {
    try {
      await navigator.clipboard.writeText(channelId);
      setToast(`Đã copy channel ${channelId}`);
      setTimeout(() => setToast(""), 5000);
    } catch {
      setToast("Không thể copy Channel ID");
      setTimeout(() => setToast(""), 5000);
    }
  }

  async function saveGroup(e) {
    e.preventDefault();

    try {
      setSaving(true);
      let nextSelectedId = editing?.id || selectedId;
      const payload = {
        ...groupForm,
        fee_rate: Number(groupForm.fee_rate || 0),
        tiers: groupForm.tiers.map((tier) => ({
          min: Number(tier.min || 0),
          max: Number(tier.max || 0),
          rate: Number(tier.rate || 0)
        }))
      };

      if (editing) {
        await api.put(`/reports/groups/${editing.id}`, payload);
        setMessage("Đã cập nhật group");
      } else {
        const res = await api.post("/reports/groups", payload);
        nextSelectedId = res.data.data?.id || selectedId;
        setSelectedId(nextSelectedId);
        setMessage("Đã tạo group");
      }

      setGroupModal(false);
      await fetchAll();
      await fetchDetail(nextSelectedId);
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi lưu group");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup() {
    if (!detail || !window.confirm("Xóa group này?")) return;
    await api.delete(`/reports/groups/${detail.id}`);
    setSelectedId(null);
    setDetail(null);
    setMessage("Đã xóa group");
    await fetchAll();
  }

  async function addChannels(e) {
    e.preventDefault();

    try {
      setSaving(true);
      const res = await api.post(`/reports/groups/${selectedId}/channels`, {
        channel_inputs: channelInputs,
        revenue_share: revenueShare,
        month
      });
      setMessage(res.data?.message || "Added channels to group");
      setAddModal(false);
      setChannelInputs("");
      setRevenueShare("");
      await fetchDetail();
      await fetchAll();
    } catch (error) {
      setMessage(error.response?.data?.message || "Lỗi thêm channel");
    } finally {
      setSaving(false);
    }
  }

  async function loadPartnerManagedChannels() {
    if (!detail?.partner_id) {
      setMessage("This group does not have a partner to load channels from.");
      return;
    }

    try {
      setLoadingPartnerChannels(true);
      const res = await api.get("/channels/management", { params: { partner_id: detail.partner_id, limit: 10000 } });
      const partnerChannelIds = (res.data.data || [])
        .map((channel) => channel.channel_id)
        .filter(Boolean);

      if (!partnerChannelIds.length) {
        setMessage("No Channel Management channels found for this partner.");
        return;
      }

      const existingLines = channelInputs
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const existingSet = new Set(existingLines.map((line) => line.toLowerCase()));
      const newLines = partnerChannelIds.filter((channelId) => !existingSet.has(String(channelId).toLowerCase()));
      const nextLines = [...existingLines, ...newLines];

      setChannelInputs(nextLines.join("\n"));
      setToast(`Loaded ${newLines.length} channel IDs from ${detail.partner_name || "partner"}`);
      setTimeout(() => setToast(""), 5000);
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load partner channels from Channel Management");
    } finally {
      setLoadingPartnerChannels(false);
    }
  }

  async function removeChannel(groupChannelId) {
    await api.delete(`/reports/groups/${selectedId}/channels/${groupChannelId}`);
    await fetchDetail();
    await fetchAll();
  }

  function selectedCompany() {
    return companies.find((company) => String(company.id) === String(selectedCompanyId)) || companies[0] || fallbackCompany;
  }

  function downloadResponseBlob(data, fileName, type) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportFromBackend(format) {
    if (!detail) return;
    try {
      setSaving(true);
      const token = localStorage.getItem("token") || "";
      const apiKey = import.meta.env.VITE_BACKEND_API_KEY || "";
      const headers = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      };

      if (format === "pdf") {
        const res = await api.post(`/reports/groups/${detail.id}/export/pdf`, {
          month,
          company_id: selectedCompanyId || selectedCompany()?.id || "",
          return_base64: true,
          include_signatures: includeSignatureBoxes
        }, {
          timeout: 60000,
          headers
        });

        const binary = atob(res.data.data || "");
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        downloadResponseBlob(
          bytes,
          res.data.fileName || `${detail.group_name || "group"}-${month}.pdf`,
          res.data.mimeType || "application/pdf"
        );
        setExportModalOpen(false);
        return;
      }

      const res = await api.post(`/reports/groups/${detail.id}/export/${format}`, {
        month,
        company_id: selectedCompanyId || selectedCompany()?.id || ""
      }, {
        responseType: "blob",
        timeout: 60000,
        headers
      });

      const contentType = res.headers?.["content-type"] || "";
      if (contentType.includes("application/json")) {
        const text = await res.data.text();
        const payload = JSON.parse(text);
        throw new Error(payload.message || payload.error || `Could not export ${format.toUpperCase()}`);
      }

      const extension = format === "pdf" ? "pdf" : "xlsx";
      const mime = format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      downloadResponseBlob(res.data, `${detail.group_name || "group"}-${month}.${extension}`, mime);
      setExportModalOpen(false);
    } catch (error) {
      if (error.response?.data instanceof Blob) {
        const text = await error.response.data.text();
        try {
          const payload = JSON.parse(text);
          setMessage(payload.message || payload.error || `Could not export ${format.toUpperCase()}`);
        } catch {
          setMessage(text || `Could not export ${format.toUpperCase()}`);
        }
      } else {
        setMessage(error.message || error.response?.data?.message || `Could not export ${format.toUpperCase()}`);
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (queryMonth && /^\d{4}-\d{2}$/.test(queryMonth) && queryMonth !== month) {
      setMonth(queryMonth);
    }
    if (queryGroupId && String(queryGroupId) !== String(selectedId || "")) {
      setSelectedId(queryGroupId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryGroupId, queryMonth]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAll();
    }, 0);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDetail(selectedId).catch((error) => setMessage(error.response?.data?.message || "Lỗi tải chi tiết group"));
    }, 0);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, month]);

  return (
    <div className="p-5 lg:p-8">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 bg-white border border-slate-200 rounded-3xl px-5 py-4 shadow-sm mb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Group Channels</h1>
          <p className="text-slate-500 text-sm mt-1">Tạo group, chọn partner, cấu hình tier và tính revenue share theo tháng.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canViewReports && (
            <button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-4 py-3 font-bold flex items-center gap-2">
              <Plus size={18} />
              Tạo group
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMonthPickerOpen((open) => !open)}
              className="min-w-[230px] flex items-center justify-between gap-3 bg-white border border-slate-300 rounded-2xl px-4 py-3 font-bold text-slate-800"
            >
              <span className="flex items-center gap-2">
                <Calendar size={18} />
                {monthLabel(month)}
              </span>
              <Calendar size={16} />
            </button>
            {monthPickerOpen && (
              <MonthPicker
                month={month}
                onChange={(value) => {
                  setMonth(value);
                  setMonthPickerOpen(false);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {message && <div className="mb-5 bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl px-5 py-4 font-medium">{message}</div>}

      <div className={groupListCollapsed ? "grid gap-5" : "grid xl:grid-cols-[360px_1fr] gap-5"}>
        {!groupListCollapsed && (
        <aside className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Users size={18} />
            <h2 className="font-black">Groups</h2>
            <div className="relative ml-auto min-w-0 flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                placeholder="Search group..."
                className="h-8 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-semibold outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </div>
            <button
              type="button"
              onClick={() => setGroupSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-700"
              title={`Sort groups ${groupSortDirection === "asc" ? "Z-A" : "A-Z"}`}
            >
              <ArrowUpDown size={13} />
            </button>
            <button
              type="button"
              onClick={() => setGroupListCollapsed(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600"
              title="Hide group list"
            >
              <MoreHorizontal size={17} />
            </button>
          </div>
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
          ) : groups.length === 0 ? (
            <div className="p-6 text-slate-500">Chưa có group nào.</div>
          ) : filteredSortedGroups.length === 0 ? (
            <div className="p-6 text-slate-500">No groups match this search.</div>
          ) : (
            <div className="p-3 space-y-2">
              {filteredSortedGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    setSelectedId(group.id);
                    setSearchParams({ group_id: String(group.id), month });
                  }}
                  className={[
                    "w-full text-left rounded-2xl p-4 border transition",
                    Number(selectedId) === Number(group.id) ? "border-emerald-300 bg-emerald-50" : "border-slate-100 hover:bg-slate-50"
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black text-slate-900 truncate">{group.group_name}</span>
                    <span className="text-xs bg-white border border-slate-200 rounded-full px-2 py-1">{group.channel_count} ch</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1 truncate">{group.partner_name}</p>
                  <p className="text-sm font-bold text-emerald-700 mt-3">{converted(group.summary?.paid_converted ?? group.summary?.paid ?? 0, group.currency)}</p>
                </button>
              ))}
            </div>
          )}
        </aside>
        )}

        <main className="space-y-5">
          {groupListCollapsed && (
            <button
              type="button"
              onClick={() => setGroupListCollapsed(false)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <MoreHorizontal size={17} />
              Show groups
            </button>
          )}
          {!detail ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-12 text-center text-slate-500">Chọn hoặc tạo group để xem chi tiết.</div>
          ) : (
            <>
              <section className="bg-white border border-slate-200 rounded-3xl shadow-sm p-5">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">{detail.group_name}</h2>
                    <p className="text-slate-500">{detail.partner_name}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canViewReports && <button onClick={() => setAddModal(true)} className="bg-emerald-600 text-white rounded-2xl px-4 py-3 font-bold flex items-center gap-2"><Plus size={17} /> Add channel</button>}
                    <button onClick={() => fetchDetail()} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 font-bold flex items-center gap-2"><RefreshCw size={17} /> Refresh</button>
                    <button onClick={() => setExportModalOpen(true)} className="bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl px-4 py-3 font-bold flex items-center gap-2"><Download size={17} /> Export</button>
                    {canViewReports && <button onClick={openEdit} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 font-bold flex items-center gap-2"><Edit3 size={17} /> Edit</button>}
                    {canViewReports && <button onClick={deleteGroup} className="bg-red-50 border border-red-100 text-red-600 rounded-2xl px-4 py-3 font-bold flex items-center gap-2"><Trash2 size={17} /> Xóa group</button>}
                  </div>
                </div>

                <div className="grid lg:grid-cols-[2fr_1fr] gap-5">
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    <p className="text-slate-500"><b className="text-slate-800">Email:</b> {detail.email || "-"}</p>
                    <p className="text-slate-500"><b className="text-slate-800">Phone:</b> {detail.phone || "-"}</p>
                    <p className="text-slate-500"><b className="text-slate-800">Address:</b> {detail.address || "-"}</p>
                    <p className="text-slate-500"><b className="text-slate-800">Bank:</b> {detail.bank_name || "-"}</p>
                    <p className="text-slate-500"><b className="text-slate-800">Account:</b> {detail.account_number || "-"}</p>
                    <p className="text-slate-500"><b className="text-slate-800">Currency:</b> {detail.currency}</p>
                    <p className="text-slate-500"><b className="text-slate-800">Fee:</b> {detail.fee_rate || 0}%</p>
                    {detail.currency !== "USD" && (
                      <p className={detail.exchange_rate?.missing ? "text-red-600" : "text-slate-500"}>
                        <b className="text-slate-800">Exchange:</b> 1 USD = {detail.exchange_rate?.factor || 1} {detail.currency}
                        {detail.exchange_rate?.missing ? " (missing rate for selected month)" : ""}
                      </p>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-4">
                    <p>
                      <span className="text-xs text-slate-500 block">Total revenue USD</span>
                      <b>{usd(detail.summary.total_revenue_usd ?? detail.summary.total_revenue)}</b>
                      <small className="block text-slate-500 mt-1">{converted(detail.summary.total_revenue_converted ?? detail.summary.total_revenue, detail.currency)}</small>
                    </p>
                    <p>
                      <span className="text-xs text-slate-500 block">Paid</span>
                      <b className="text-emerald-700">{converted(detail.summary.paid_converted ?? detail.summary.paid, detail.currency)}</b>
                      <small className="block text-slate-500 mt-1">{usd(detail.summary.paid_usd ?? detail.summary.paid)}</small>
                    </p>
                    <p>
                      <span className="text-xs text-slate-500 block">Remaining USD</span>
                      <b className="text-orange-600">{usd(detail.summary.remaining_usd ?? detail.summary.remaining)}</b>
                      <small className="block text-slate-500 mt-1">{converted(detail.summary.remaining_converted ?? detail.summary.remaining, detail.currency)}</small>
                    </p>
                    <p>
                      <span className="text-xs text-slate-500 block">Fee</span>
                      <b className="text-red-600">{converted(detail.summary.fee_converted ?? 0, detail.currency)}</b>
                      <small className="block text-slate-500 mt-1">{detail.summary.fee_rate ?? detail.fee_rate ?? 0}%</small>
                    </p>
                    <p>
                      <span className="text-xs text-slate-500 block">Payable</span>
                      <b className="text-emerald-700">{converted(detail.summary.payable_converted ?? detail.summary.paid_converted ?? detail.summary.paid, detail.currency)}</b>
                      <small className="block text-slate-500 mt-1">{usd(detail.summary.payable_usd ?? detail.summary.paid_usd ?? detail.summary.paid)}</small>
                    </p>
                    <p><span className="text-xs text-slate-500 block">Channels</span><b>{detail.summary.channels}</b></p>
                  </div>
                </div>

                  <div className="mt-5">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Revenue Tiers</h3>
                  {(detail.tiers || []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      Group này không dùng tier. Channel chỉ tính share khi có % riêng.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(detail.tiers || []).map((tier, index) => (
                        <div key={index} className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm">
                          <span className="font-bold">{money(tier.min, detail.currency)} - {money(tier.max, detail.currency)}</span>
                          <span className="font-black">{tier.rate}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                  <h2 className="font-black">List Channels</h2>
                  <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded-full">
                    {channelSearch.trim() ? `${sortedDetailChannels.length} / ${detail.channels?.length || 0}` : detail.channels?.length || 0} channels
                  </span>
                  <div className="relative min-w-[240px] max-w-md flex-1 sm:flex-none">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={channelSearch}
                      onChange={(event) => setChannelSearch(event.target.value)}
                      placeholder="Search channel name, ID, keyword..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    />
                    {channelSearch && (
                      <button
                        type="button"
                        onClick={() => setChannelSearch("")}
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {!detail.channels?.length ? (
                  <div className="p-12 text-slate-500">Group này chưa có channel nào.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left px-5 py-3">
                            <SortButton label="Channel" active={channelSort.key === "channel"} direction={channelSort.direction} onClick={() => toggleChannelSort("channel")} />
                          </th>
                          <th className="text-right px-5 py-3">
                            <SortButton label="Revenue USD" active={channelSort.key === "revenue"} direction={channelSort.direction} onClick={() => toggleChannelSort("revenue")} align="right" />
                          </th>
                          <th className="text-right px-5 py-3">
                            <SortButton label="Share Amount USD" active={channelSort.key === "share"} direction={channelSort.direction} onClick={() => toggleChannelSort("share")} align="right" />
                          </th>
                          <th className="text-right px-5 py-3">
                            <SortButton label={`Paid (${detail.currency})`} active={channelSort.key === "paid"} direction={channelSort.direction} onClick={() => toggleChannelSort("paid")} align="right" />
                          </th>
                          {canViewReports && <th className="text-right px-5 py-3">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedDetailChannels.length === 0 && (
                          <tr>
                            <td colSpan={canViewReports ? 5 : 4} className="px-5 py-10 text-center text-slate-500">
                              No channels match this search.
                            </td>
                          </tr>
                        )}
                        {sortedDetailChannels.map((channel) => (
                          <tr key={channel.group_channel_id}>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3 min-w-[260px]">
                                <a
                                  href={`https://www.youtube.com/channel/${channel.channel_id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0"
                                  title="Mở channel trong tab mới"
                                >
                                  <img src={channel.thumbnail || "/favicon.svg"} className="w-full h-full object-cover" />
                                </a>
                                <div className="min-w-0">
                                  <p className="font-black text-slate-900">{channel.title || channel.channel_id}</p>
                                  <div className="flex items-center gap-2">
                                    <p className="font-mono text-xs text-emerald-700 truncate">{channel.channel_id}</p>
                                    <button
                                      type="button"
                                      onClick={() => copyChannelId(channel.channel_id)}
                                      className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700 flex items-center justify-center"
                                      title="Copy Channel ID"
                                    >
                                      <Copy size={13} />
                                    </button>
                                  </div>
                                  <p className="text-xs text-slate-500">Share: {channel.applied_share || 0}%</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right font-black">{usd(channel.revenue_usd ?? channel.revenue)}</td>
                            <td className="px-5 py-4 text-right font-black text-slate-900">{usd(channel.share_amount)}</td>
                            <td className="px-5 py-4 text-right font-black text-emerald-700">{converted(channel.paid ?? channel.share_amount_converted ?? channel.share_amount, detail.currency)}</td>
                            {canViewReports && (
                              <td className="px-5 py-4 text-right">
                                <button onClick={() => removeChannel(channel.group_channel_id)} className="px-3 py-2 rounded-xl bg-red-50 text-red-600 font-bold inline-flex items-center gap-2">
                                  <Trash2 size={15} />
                                  Xóa
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {groupModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={saveGroup} className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-black text-xl">{editing ? "Sửa Group Channel" : "Tạo Group Channel"}</h2>
              <button type="button" onClick={() => setGroupModal(false)} className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="p-6">
              <GroupForm partners={partners} value={groupForm} onChange={setGroupForm} />
            </div>
            <div className="px-6 py-5 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => setGroupModal(false)} className="px-5 py-3 rounded-2xl border border-slate-300 font-bold">Hủy</button>
              <button type="submit" disabled={saving} className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-bold flex items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={18} /> : null}
                {editing ? "Lưu group" : "Tạo group"}
              </button>
            </div>
          </form>
        </div>
      )}

      {addModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={addChannels} className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-black text-xl">Add channels to group</h2>
              <button type="button" onClick={() => setAddModal(false)} className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-5">
              <label>
                <span className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-black text-slate-900">Channel IDs / Handles / Links</span>
                  <button
                    type="button"
                    onClick={loadPartnerManagedChannels}
                    disabled={loadingPartnerChannels || !detail?.partner_id}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Load Channel Management channels assigned to this partner"
                  >
                    {loadingPartnerChannels ? <Loader2 className="animate-spin" size={14} /> : <Users size={14} />}
                    Load partner channels
                  </button>
                </span>
                <textarea
                  value={channelInputs}
                  onChange={(e) => setChannelInputs(e.target.value)}
                  className="w-full min-h-44 rounded-3xl border border-slate-300 px-4 py-4 outline-none focus:border-emerald-500"
                  placeholder={"UCxxxxxxxx\n@mychannel\nhttps://youtube.com/@mychannel"}
                  required
                />
              </label>
              <label>
                <span className="font-black text-slate-900 mb-3 block">Revenue share</span>
                <input
                  type="number"
                  value={revenueShare}
                  onChange={(e) => setRevenueShare(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
                  placeholder="Có thể để trống"
                />
              </label>
            </div>
            <div className="px-6 py-5 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => setAddModal(false)} className="px-5 py-3 rounded-2xl border border-slate-300 font-bold">Hủy</button>
              <button type="submit" disabled={saving} className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-bold flex items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={18} /> : null}
                Thêm channel
              </button>
            </div>
          </form>
        </div>
      )}

      {exportModalOpen && detail && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-black text-xl">Export invoice</h2>
                <p className="text-sm text-slate-500 mt-1">Choose the sender company and export format.</p>
              </div>
              <button type="button" onClick={() => setExportModalOpen(false)} className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {canViewReports && (
              <label>
                <span className="text-xs font-black uppercase text-slate-400 mb-2 block">Company</span>
                <select
                  value={selectedCompanyId}
                  onChange={(event) => setSelectedCompanyId(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 bg-white"
                >
                  {companies.length === 0 ? (
                    <option value="">Default company profile</option>
                  ) : companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.company_name}</option>
                  ))}
                </select>
              </label>
              )}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p><b className="text-slate-900">Partner:</b> {detail.partner_name}</p>
                <p><b className="text-slate-900">Month:</b> {monthLabel(detail.month)}</p>
                <p><b className="text-slate-900">Payable:</b> {converted(detail.summary?.payable_converted ?? detail.summary?.paid_converted ?? 0, detail.currency)}</p>
              </div>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSignatureBoxes}
                  onChange={(event) => setIncludeSignatureBoxes(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block font-black text-slate-900">Include signature boxes in PDF</span>
                  <span className="block text-sm text-slate-500 mt-1">Add company and partner signature areas with Sign, Name, and Title lines.</span>
                </span>
              </label>
            </div>
            <div className="px-6 py-5 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => setExportModalOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-300 font-bold">Cancel</button>
              <button
                type="button"
                onClick={() => exportFromBackend("excel")}
                disabled={saving}
                className="px-5 py-3 rounded-2xl bg-blue-600 text-white font-bold flex items-center gap-2"
              >
                <Download size={18} />
                Excel
              </button>
              <button
                type="button"
                onClick={() => exportFromBackend("pdf")}
                disabled={saving}
                className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-bold flex items-center gap-2"
              >
                <Download size={18} />
                PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-6 z-[60] -translate-x-1/2 rounded-2xl bg-slate-950 text-white px-5 py-3 shadow-2xl flex items-center gap-3">
          <Check size={18} className="text-emerald-400" />
          <span className="font-bold">{toast}</span>
        </div>
      )}
    </div>
  );
}
