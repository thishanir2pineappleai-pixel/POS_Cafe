// Conversions between the plain rows the services use and the Prisma rows.
//   * Epoch-millisecond columns are BigInt in MySQL and plain numbers in the rows the code handles (clock.now()).
//   * Only the listed fields are ever written, so a caller can never overwrite an id or a server-set column by accident.
const num = (v) => (v === null || v === undefined ? null : Number(v));
const big = (v) => (v === null || v === undefined ? null : BigInt(v));

// row: a Prisma row; bigFields: names of BigInt columns to turn into numbers; dateFields: DateTime columns to ISO strings.
function toRow(row, { bigFields = [], dateFields = [] } = {}) {
  if (!row) return null;
  const out = { ...row };
  for (const f of bigFields) out[f] = num(row[f]);
  for (const f of dateFields) out[f] = row[f].toISOString();
  return out;
}

// data: the values to store; fields: the allowed column names; bigFields: the BigInt ones among them.
function toData(data, fields, bigFields = []) {
  const out = {};
  for (const f of fields) {
    if (data[f] === undefined) continue;
    out[f] = bigFields.includes(f) ? big(data[f]) : data[f];
  }
  return out;
}

module.exports = { num, big, toRow, toData };
