// CSV text built with Node only (no dependency).
// - Every cell is quoted and inner quotes are doubled.
// - Text cells starting with = + - @ (or a tab/CR) get a leading ' so a spreadsheet never runs them as a formula.
// - A UTF-8 byte order mark is added so Excel reads non-English names correctly.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

module.exports = { toCsv };
