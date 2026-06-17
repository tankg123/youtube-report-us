const path = require("path");
const ExcelJS = require("exceljs");

const EXCELJS_MERGE_CELL_TYPE = 8;

function safeStr(value) {
  return value == null ? "" : String(value);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round2(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function normalizedCurrency(value) {
  const currency = safeStr(value).trim().toUpperCase();
  return ["USD", "GBP", "VND"].includes(currency) ? currency : "USD";
}

function formatMonthLabel(month = "") {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, monthValue] = month.split("-");
  return `${monthValue}/${year}`;
}

function moneyText(value, currency = "USD") {
  const normalized = normalizedCurrency(currency);
  return new Intl.NumberFormat(
    normalized === "VND" ? "vi-VN" : normalized === "GBP" ? "en-GB" : "en-US",
    {
      minimumFractionDigits: normalized === "VND" ? 0 : 2,
      maximumFractionDigits: normalized === "VND" ? 0 : 2
    }
  ).format(normalized === "VND" ? Math.round(toNumber(value)) : round2(value));
}

const VN_NUM = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readThreeDigits(input, full) {
  const value = input % 1000;
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const output = [];

  if (full || hundreds > 0) output.push(VN_NUM[hundreds], "trăm");

  if (tens === 0) {
    if (units !== 0) {
      if (full || hundreds > 0) output.push("lẻ");
      output.push(units === 5 && (full || hundreds > 0) ? "năm" : VN_NUM[units]);
    }
  } else if (tens === 1) {
    output.push("mười");
    if (units === 5) output.push("lăm");
    else if (units !== 0) output.push(VN_NUM[units]);
  } else {
    output.push(VN_NUM[tens], "mươi");
    if (units === 1) output.push("mốt");
    else if (units === 4) output.push("tư");
    else if (units === 5) output.push("lăm");
    else if (units !== 0) output.push(VN_NUM[units]);
  }

  return output.join(" ").replace(/\s+/g, " ").trim();
}

function integerWords(value) {
  let number = Math.round(toNumber(value));
  if (number === 0) return "Không";
  if (number < 0) return `Âm ${integerWords(Math.abs(number))}`;

  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const parts = [];
  let index = 0;

  while (number > 0 && index < units.length) {
    const block = number % 1000;
    number = Math.floor(number / 1000);

    if (block !== 0) {
      const text = readThreeDigits(block, number > 0);
      parts.unshift(`${text} ${units[index]}`.trim());
    }

    index += 1;
  }

  const result = parts.join(" ").replace(/\s+/g, " ").trim();
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function moneyWords(value, currency) {
  const normalized = normalizedCurrency(currency);
  if (normalized === "VND") return `${integerWords(value)} đồng`;
  if (normalized === "GBP") return `${integerWords(value)} bảng Anh`;

  const amount = Math.abs(toNumber(value));
  let dollars = Math.floor(amount);
  let cents = Math.round((amount - dollars) * 100);
  if (cents === 100) {
    dollars += 1;
    cents = 0;
  }

  const prefix = toNumber(value) < 0 ? "Âm " : "";
  const dollarsText = `${integerWords(dollars)} đô la`;
  return cents > 0 ? `${prefix}${dollarsText} và ${integerWords(cents)} cent` : `${prefix}${dollarsText}`;
}

function getByPath(source, pathValue) {
  return pathValue
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((value, key) => {
      if (value == null || typeof value !== "object") return undefined;
      return value[key];
    }, source);
}

function itemValue(item, field, payload) {
  if (field === "yt_channel_id") return item.yt_channels_id;
  if (field === "payout_by_type") return moneyText(item.payout_value, payload.meta.type_rate);
  return item[field];
}

function resolvePlaceholder(payload, key, item) {
  const cleanKey = key.trim();

  if (cleanKey.startsWith("table.items.")) {
    return item ? itemValue(item, cleanKey.replace("table.items.", "").trim(), payload) : "";
  }

  if (cleanKey === "grand.total_payout") return moneyText(payload.grand_raw.total_payout, payload.meta.type_rate);
  if (cleanKey === "grand.tax") return moneyText(payload.grand_raw.tax, payload.meta.type_rate);
  if (cleanKey === "grand.advance") return moneyText(payload.grand_raw.advance, payload.meta.type_rate);
  if (cleanKey === "grand.payable") return moneyText(payload.grand_raw.payable, payload.meta.type_rate);

  const value = getByPath(payload, cleanKey);
  return value == null ? "" : value;
}

function transformStaticText(input, payload) {
  const currency = normalizedCurrency(payload.meta.type_rate);
  if (currency === "VND") return input;
  return input.replace(/\(VND\)/g, `(${currency})`);
}

function replaceInString(payload, input, item) {
  const transformed = transformStaticText(input, payload);
  const pure = transformed.match(/^\$\{([^}]+)\}$/);

  if (pure) {
    return {
      result: resolvePlaceholder(payload, pure[1], item),
      pure: true
    };
  }

  const result = transformed.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const value = resolvePlaceholder(payload, key, item);
    return value == null ? "" : String(value);
  });

  return {
    result,
    pure: false
  };
}

function getMerges(ws) {
  return ws._merges || {};
}

function snapshotRow(ws, rowNumber) {
  const row = ws.getRow(rowNumber);
  const cells = [];

  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cells.push({
      col,
      value: cell.value,
      style: JSON.parse(JSON.stringify(cell.style || {})),
      numFmt: cell.numFmt,
      isMaster: cell.type !== EXCELJS_MERGE_CELL_TYPE
    });
  });

  const merges = [];
  for (const key of Object.keys(getMerges(ws))) {
    const entry = getMerges(ws)[key];
    const merge = entry?.model || entry;
    if (merge && merge.top === rowNumber && merge.bottom === rowNumber && merge.left !== merge.right) {
      merges.push({ startCol: merge.left, endCol: merge.right });
    }
  }

  return {
    height: row.height || 15,
    cells,
    merges
  };
}

function clearOverlappingRowMerges(ws, rowNumber, startCol, endCol) {
  const raw = getMerges(ws);

  for (const key of Object.keys(raw)) {
    const entry = raw[key];
    const merge = entry?.model || entry;
    if (!merge) continue;

    if (
      merge.top <= rowNumber &&
      merge.bottom >= rowNumber &&
      merge.left <= endCol &&
      merge.right >= startCol
    ) {
      delete raw[key];
    }
  }
}

function applySnapshotToRow(ws, rowNumber, snapshot) {
  const row = ws.getRow(rowNumber);
  row.height = snapshot.height;

  for (const cellSnapshot of snapshot.cells) {
    const cell = row.getCell(cellSnapshot.col);
    cell.style = JSON.parse(JSON.stringify(cellSnapshot.style || {}));
    cell.numFmt = cellSnapshot.numFmt;
    if (cellSnapshot.isMaster) cell.value = cellSnapshot.value;
  }

  for (const merge of snapshot.merges) {
    clearOverlappingRowMerges(ws, rowNumber, merge.startCol, merge.endCol);
    ws.mergeCells(rowNumber, merge.startCol, rowNumber, merge.endCol);
  }
}

function shiftMergesDown(ws, afterRow, count) {
  if (count <= 0) return;
  const raw = getMerges(ws);
  const additions = [];
  const deletions = [];

  for (const key of Object.keys(raw)) {
    const entry = raw[key];
    const merge = entry?.model || entry;
    if (!merge) continue;

    if (merge.top > afterRow) {
      deletions.push(key);
      additions.push({
        top: merge.top + count,
        bottom: merge.bottom + count,
        left: merge.left,
        right: merge.right
      });
    }
  }

  deletions.forEach((key) => delete raw[key]);
  additions.forEach((merge) => ws.mergeCells(merge.top, merge.left, merge.bottom, merge.right));
}

function findItemsTemplateRow(ws) {
  let found = null;
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (found) return;
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (typeof cell.value === "string" && cell.value.includes("${table.items.")) found = rowNumber;
    });
  });
  return found;
}

function cloneStyle(sourceCell, targetCell) {
  targetCell.style = JSON.parse(JSON.stringify(sourceCell.style || {}));
  targetCell.numFmt = sourceCell.numFmt;
  targetCell.alignment = sourceCell.alignment ? { ...sourceCell.alignment } : targetCell.alignment;
  targetCell.font = sourceCell.font ? { ...sourceCell.font } : targetCell.font;
  targetCell.fill = sourceCell.fill ? { ...sourceCell.fill } : targetCell.fill;
  targetCell.border = sourceCell.border ? { ...sourceCell.border } : targetCell.border;
}

function copyCell(sourceCell, targetCell) {
  cloneStyle(sourceCell, targetCell);
  targetCell.value = cloneCellValue(sourceCell.value);
}

function cloneCellValue(value) {
  if (value == null) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function snapshotRows(ws, startRow, endRow, maxCol) {
  const rows = [];
  const merges = [];

  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    const cells = [];

    for (let col = 1; col <= maxCol; col += 1) {
      const cell = row.getCell(col);
      cells.push({
        col,
        value: cloneCellValue(cell.value),
        style: JSON.parse(JSON.stringify(cell.style || {})),
        numFmt: cell.numFmt,
        isMaster: cell.type !== EXCELJS_MERGE_CELL_TYPE
      });
    }

    rows.push({
      rowNumber,
      height: row.height,
      cells
    });
  }

  for (const key of Object.keys(getMerges(ws))) {
    const entry = getMerges(ws)[key];
    const merge = entry?.model || entry;
    if (!merge) continue;

    if (merge.top >= startRow && merge.bottom <= endRow) {
      merges.push({
        top: merge.top,
        left: merge.left,
        bottom: merge.bottom,
        right: merge.right
      });
    }
  }

  return {
    startRow,
    endRow,
    maxCol,
    rows,
    merges
  };
}

function restoreRows(ws, snapshot, clearMaxCol, rowOffset = 0) {
  if (!snapshot) return;
  const raw = getMerges(ws);
  const startRow = snapshot.startRow + rowOffset;
  const endRow = snapshot.endRow + rowOffset;
  const overlappingMerges = [];

  for (const key of Object.keys(raw)) {
    const entry = raw[key];
    const merge = entry?.model || entry;
    if (!merge) continue;

    if (merge.top <= endRow && merge.bottom >= startRow) {
      overlappingMerges.push({ key, ...merge });
    }
  }

  for (const merge of overlappingMerges) {
    try {
      ws.unMergeCells(`${ws.getCell(merge.top, merge.left).address}:${ws.getCell(merge.bottom, merge.right).address}`);
    } catch {
      delete raw[merge.key];
    }
  }

  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    for (let col = 1; col <= clearMaxCol; col += 1) {
      const cell = row.getCell(col);
      cell.value = null;
      cell.style = {};
    }
  }

  for (const rowSnapshot of snapshot.rows) {
    const row = ws.getRow(rowSnapshot.rowNumber + rowOffset);
    row.height = rowSnapshot.height;

    for (const cellSnapshot of rowSnapshot.cells) {
      const cell = row.getCell(cellSnapshot.col);
      cell.style = JSON.parse(JSON.stringify(cellSnapshot.style || {}));
      cell.numFmt = cellSnapshot.numFmt;
      if (cellSnapshot.isMaster) cell.value = cloneCellValue(cellSnapshot.value);
    }
  }

  for (const merge of snapshot.merges) {
    clearOverlappingRowMerges(ws, merge.top + rowOffset, merge.left, merge.right);
    ws.mergeCells(merge.top + rowOffset, merge.left, merge.bottom + rowOffset, merge.right);
  }
}

function clearColumnsOutsideRows(ws, startCol, endCol, protectedStartRow, protectedEndRow) {
  if (!startCol || !endCol || startCol > endCol) return;
  const raw = getMerges(ws);
  const overlappingMerges = [];

  for (const key of Object.keys(raw)) {
    const entry = raw[key];
    const merge = entry?.model || entry;
    if (!merge) continue;

    const overlapsColumns = merge.left <= endCol && merge.right >= startCol;
    const outsideProtectedRows = merge.bottom < protectedStartRow || merge.top > protectedEndRow;
    if (overlapsColumns && outsideProtectedRows) overlappingMerges.push({ key, ...merge });
  }

  for (const merge of overlappingMerges) {
    try {
      ws.unMergeCells(`${ws.getCell(merge.top, merge.left).address}:${ws.getCell(merge.bottom, merge.right).address}`);
    } catch {
      delete raw[merge.key];
    }
  }

  const lastRow = Math.max(ws.rowCount || 0, ws.actualRowCount || 0);
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    if (rowNumber >= protectedStartRow && rowNumber <= protectedEndRow) continue;
    const row = ws.getRow(rowNumber);

    for (let col = startCol; col <= endCol; col += 1) {
      const cell = row.getCell(col);
      cell.value = null;
      cell.style = {};
    }
  }
}

function insertRevenueTaxExportColumns(ws, templateRow) {
  const template = ws.getRow(templateRow);
  let totalStartCol = null;
  let totalEndCol = null;

  template.eachCell({ includeEmpty: true }, (cell, col) => {
    if (typeof cell.value === "string" && cell.value.includes("${table.items.total_usd}")) {
      if (totalStartCol == null) totalStartCol = col;
      totalEndCol = col;
    }
  });

  if (totalStartCol == null || totalEndCol == null) return;

  const insertAt = totalEndCol + 1;
  const insertedColumnCount = 4;
  const originalLastCol = totalEndCol + 3;
  const shiftedLastCol = originalLastCol + insertedColumnCount;

  const headerGroupRow = templateRow - 3;
  const headerRow = templateRow - 2;
  const formulaRow = templateRow - 1;
  const tableRows = [headerGroupRow, headerRow, formulaRow, templateRow];
  const inserted = [
    { header: "Revenue US", placeholder: "${table.items.revenue_us}" },
    { header: "Tax US", placeholder: "${table.items.tax_us}" },
    { header: "Revenue BR", placeholder: "${table.items.revenue_br}" },
    { header: "Tax BR", placeholder: "${table.items.tax_br}" }
  ];

  const headerStyleSource = ws.getCell(headerRow, totalStartCol);
  const itemStyleSource = ws.getCell(templateRow, totalStartCol);
  const formulaStyleSource = ws.getCell(formulaRow, totalStartCol);
  const groupStyleSource = ws.getCell(headerGroupRow, totalStartCol);

  for (const rowNumber of tableRows) {
    clearOverlappingRowMerges(ws, rowNumber, insertAt, shiftedLastCol);

    for (let col = originalLastCol; col >= insertAt; col -= 1) {
      const sourceCell = ws.getCell(rowNumber, col);
      const targetCell = ws.getCell(rowNumber, col + insertedColumnCount);
      copyCell(sourceCell, targetCell);
      sourceCell.value = null;
      sourceCell.style = {};
    }
  }

  inserted.forEach((column, index) => {
    const col = insertAt + index;
    ws.getColumn(col).width = 14;

    const groupCell = ws.getCell(headerGroupRow, col);
    cloneStyle(groupStyleSource, groupCell);

    const headerCell = ws.getCell(headerRow, col);
    cloneStyle(headerStyleSource, headerCell);
    headerCell.value = column.header;

    const formulaCell = ws.getCell(formulaRow, col);
    cloneStyle(formulaStyleSource, formulaCell);
    formulaCell.value = "";

    const itemCell = ws.getCell(templateRow, col);
    cloneStyle(itemStyleSource, itemCell);
    itemCell.value = column.placeholder;
    itemCell.numFmt = "#,##0.00";
  });

  clearOverlappingRowMerges(ws, headerGroupRow, totalStartCol, shiftedLastCol);
  ws.mergeCells(headerGroupRow, totalStartCol, headerGroupRow, shiftedLastCol);

  return {
    rightCol: shiftedLastCol
  };
}

function extendRevenueTaxFooterSummary(ws, templateRow, itemCount, rightCol) {
  const valueStartCol = 8;
  const firstSummaryRow = templateRow + itemCount + 2;

  for (let rowNumber = firstSummaryRow; rowNumber < firstSummaryRow + 4; rowNumber += 1) {
    const sourceCell = ws.getCell(rowNumber, valueStartCol);
    const value = cloneCellValue(sourceCell.value);
    const styleSource = ws.getCell(rowNumber, valueStartCol);

    clearOverlappingRowMerges(ws, rowNumber, valueStartCol, rightCol);

    for (let col = valueStartCol; col <= rightCol; col += 1) {
      const cell = ws.getCell(rowNumber, col);
      cloneStyle(styleSource, cell);
      cell.value = null;
    }

    const targetCell = ws.getCell(rowNumber, valueStartCol);
    targetCell.value = value;
    targetCell.alignment = {
      ...(targetCell.alignment || {}),
      horizontal: "right"
    };
    ws.mergeCells(rowNumber, valueStartCol, rowNumber, rightCol);
  }
}

function replacePlaceholders(ws, payload, item) {
  ws.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value;

      if (typeof value === "string") {
        if (value.includes("${")) {
          const replaced = replaceInString(payload, value, item);
          cell.value = typeof replaced.result === "number" ? replaced.result : String(replaced.result || "");
          return;
        }

        const transformed = transformStaticText(value, payload);
        if (transformed !== value) cell.value = transformed;
        return;
      }

      if (value && typeof value === "object" && Array.isArray(value.richText)) {
        cell.value = {
          richText: value.richText.map((run) => ({
            ...run,
            text: typeof run.text === "string" && run.text.includes("${")
              ? String(replaceInString(payload, run.text, item).result || "")
              : transformStaticText(run.text || "", payload)
          }))
        };
      }
    });
  });
}

function makePayload(detail, company, options = {}) {
  const currency = normalizedCurrency(detail.currency || "USD");
  const advance = toNumber(options.advance, 0);
  const fee = toNumber(detail.summary?.fee_converted, 0);
  const totalPayout = toNumber(detail.summary?.paid_converted, 0);
  const payable = toNumber(detail.summary?.payable_converted, totalPayout - fee - advance);

  return {
    time: formatMonthLabel(detail.month || ""),
    company: {
      name: safeStr(company.company_name),
      address: safeStr(company.address),
      phone: safeStr(company.phone),
      email: safeStr(company.email),
      representative: safeStr(company.representative_name),
      position: safeStr(company.representative_position)
    },
    partner: {
      name: safeStr(detail.partner_name || detail.display_name),
      address: safeStr(detail.address),
      phone: safeStr(detail.phone),
      email: safeStr(detail.email),
      representative: safeStr(detail.contact_name || detail.partner_name),
      position: safeStr(detail.position)
    },
    exchange_rate: {
      title: detail.exchange_rate?.description
        ? ` ${safeStr(detail.exchange_rate.description)}`
        : "Exchange month description",
      value: currency === "USD"
        ? ""
        : `1 USD = ${moneyText(detail.exchange_rate?.factor || 0, currency)}`
    },
    table: {
      items: (detail.channels || []).map((channel, index) => ({
        no: index + 1,
        channel: safeStr(channel.title || "Channel lỗi / die"),
        yt_channels_id: safeStr(channel.channel_id),
        network: safeStr(channel.network_name || "-"),
        total_usd: round2(channel.revenue_usd),
        revenue_us: round2(channel.revenue_us),
        tax_us: round2(toNumber(channel.revenue_us) * 0.3),
        revenue_br: round2(channel.revenue_br),
        tax_br: round2(toNumber(channel.revenue_br) * 0.14),
        share_rate: `${round2(channel.applied_share)}%`,
        payout_value: currency === "USD" ? round2(channel.share_amount) : toNumber(channel.paid ?? channel.share_amount_converted),
        payout_usd: round2(channel.share_amount),
        payout_vnd: currency === "VND" ? toNumber(channel.paid ?? channel.share_amount_converted) : null,
        note: safeStr(channel.status === "error" ? channel.status_error : "")
      }))
    },
    sum: {
      total_usd: round2(detail.summary?.total_revenue_usd)
    },
    grand: {
      total_payout: moneyText(totalPayout, currency),
      tax: moneyText(fee, currency),
      advance: moneyText(advance, currency),
      payable: moneyText(payable, currency),
      payable_words: moneyWords(payable, currency)
    },
    grand_raw: {
      total_payout: totalPayout,
      tax: fee,
      advance,
      payable
    },
    meta: {
      group_channel_id: safeStr(detail.id),
      group_channel_name: safeStr(detail.group_name),
      month_revenue: safeStr(detail.month),
      currency,
      type_rate: currency
    }
  };
}

async function generateGroupReconciliationExcel(detail, company, options = {}) {
  const templatePath = path.resolve(__dirname, "../../templates/youtube-reconciliation.template.v2.xlsx");
  const payload = makePayload(detail, company, options);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  for (const ws of workbook.worksheets) {
    ws.name = safeStr(detail.partner_name || detail.group_name || "Reconciliation").slice(0, 31) || "Reconciliation";
    const templateRow = findItemsTemplateRow(ws);
    const includeRevenueTaxColumns = Boolean(options.export_us_br || options.exportUsBr);
    let taxColumnState = null;
    const items = payload.table.items.length > 0
      ? payload.table.items
        : [{
          no: 1,
          channel: "",
          yt_channels_id: "",
          network: "",
          total_usd: 0,
          revenue_us: 0,
          tax_us: 0,
          revenue_br: 0,
          tax_br: 0,
          share_rate: "",
          payout_value: 0,
          note: ""
        }];

    if (templateRow) {
      if (includeRevenueTaxColumns) taxColumnState = insertRevenueTaxExportColumns(ws, templateRow);
      const snapshot = snapshotRow(ws, templateRow);
      const insertedItemRows = Math.max(items.length - 1, 0);

      if (insertedItemRows > 0) {
        ws.spliceRows(templateRow + 1, 0, ...new Array(insertedItemRows).fill([]));
        shiftMergesDown(ws, templateRow, insertedItemRows);

        for (let index = 1; index < items.length; index += 1) {
          applySnapshotToRow(ws, templateRow + index, snapshot);
        }
      }

      for (let index = 0; index < items.length; index += 1) {
        const row = ws.getRow(templateRow + index);
        row.eachCell({ includeEmpty: true }, (cell) => {
          if (typeof cell.value === "string" && cell.value.includes("${")) {
            const replaced = replaceInString(payload, cell.value, items[index]);
            cell.value = typeof replaced.result === "number" ? replaced.result : String(replaced.result || "");
          }
        });
      }
    }

    replacePlaceholders(ws, payload);
    if (taxColumnState?.rightCol) {
      extendRevenueTaxFooterSummary(ws, templateRow, items.length, taxColumnState.rightCol);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = {
  generateGroupReconciliationExcel
};
