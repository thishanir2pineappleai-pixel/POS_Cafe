// Validation for payroll records, rewards and deductions (Payroll tab). Money is an amount with at most 2 decimals.
const clock = require('@pos-cafe/shared/clock');
const { localDate, parseDateOnly } = require('@pos-cafe/shared/date');
const { DEDUCTION_REASONS, PAYROLL_STATUS, REWARD_REASONS } = require('../../config/constants/staff');
const { parsePagination } = require('@pos-cafe/shared/pagination');
const { isPlainObject, toInt } = require('@pos-cafe/shared/validator');
const { notAnObject, queryOneOf, queryText, reader } = require('@pos-cafe/shared/reader');
const { validate } = require('@pos-cafe/shared/validate');

const idQuery = (query, field, errors) => {
  if (query[field] === undefined || query[field] === '') return undefined;
  const n = toInt(query[field], { min: 1 });
  if (n === null) errors.push({ field, message: 'Must be a positive whole number' });
  return n ?? undefined;
};
const monthOf = (query, errors) => {
  const r = reader(query, errors);
  return r.month('month', { required: false });
};

// POST /payroll/records: a pay record for one staff member and pay date. The basic salary defaults to the one on the staff record.
function parseRecordCreate(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const errors = [];
  const r = reader(req.body, errors);
  return { value: { staffId: r.int('staffId', { min: 1 }), payDate: r.date('payDate'), basicSalary: r.amount('basicSalary', { required: false, positive: true }) }, errors };
}

// PUT /payroll/records/:id: the "Edit Staff Payroll Details" dialog (Basic Salary and Pay Date).
function parseRecordUpdate(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const errors = [];
  const r = reader(req.body, errors);
  const value = { basicSalary: r.amount('basicSalary', { required: false, positive: true }), payDate: r.date('payDate', { required: false }) };
  if (errors.length === 0 && value.basicSalary === undefined && value.payDate === undefined) errors.push({ field: 'body', message: 'Send basicSalary or payDate' });
  return { value, errors };
}

function parseRecordQuery(req) {
  const query = req.query;
  const errors = [];
  const { page, limit, errors: pageErrors } = parsePagination(query);
  errors.push(...pageErrors);
  return {
    value: {
      q: queryText(query, 'q', errors),
      status: queryOneOf(query, 'status', Object.values(PAYROLL_STATUS), errors),
      roleId: idQuery(query, 'roleId', errors),
      staffId: idQuery(query, 'staffId', errors),
      month: monthOf(query, errors),
      shopId: idQuery(query, 'shopId', errors),
      page, limit,
      format: queryOneOf(query, 'format', ['csv', 'pdf', 'xls'], errors),
    },
    errors,
  };
}

function parseSummaryQuery(req) {
  const query = req.query;
  const errors = [];
  const months = query.months === undefined ? 6 : toInt(query.months, { min: 1, max: 12 });
  if (months === null) errors.push({ field: 'months', message: 'Must be a whole number from 1 to 12' });
  return {
    value: { month: monthOf(query, errors) ?? localDate(clock.now()).slice(0, 7), months: months ?? 6, shopId: idQuery(query, 'shopId', errors) },
    errors,
  };
}

// Rewards and deductions share the staff / date / reason shape. "Other" needs a specific reason (the Figma's extra field).
function parseEntry(reasons, amountFields) {
  return (req) => {
    if (!isPlainObject(req.body)) return notAnObject();
    const errors = [];
    const r = reader(req.body, errors);
    const reason = r.oneOf('reason', reasons);
    const value = {
      staffId: r.int('staffId', { min: 1 }),
      date: r.date('date'),
      reason,
      specificReason: reason === 'Other' ? r.text('specificReason', { max: 255 }) : null,
    };
    for (const field of amountFields) value[field] = r.amount(field, { positive: true });
    if (amountFields.includes('monthlyAmount') && value.monthlyAmount !== undefined && value.totalAmount !== undefined && value.monthlyAmount > value.totalAmount) {
      r.fail('monthlyAmount', 'Must not be more than the total amount');
    }
    return { value, errors };
  };
}

function parseEntryQuery(req) {
  const query = req.query;
  const errors = [];
  const { page, limit, errors: pageErrors } = parsePagination(query);
  errors.push(...pageErrors);
  let date;
  if (query.date !== undefined && query.date !== '') {
    date = parseDateOnly(query.date);
    if (!date) errors.push({ field: 'date', message: 'Must be a real date as YYYY-MM-DD' });
  }
  return { value: { staffId: idQuery(query, 'staffId', errors), date: date ?? undefined, shopId: idQuery(query, 'shopId', errors), page, limit, format: queryOneOf(query, 'format', ['csv', 'pdf', 'xls'], errors) }, errors };
}

module.exports = {
  validateRecordCreate: validate(parseRecordCreate),
  validateRecordUpdate: validate(parseRecordUpdate),
  validateRecordQuery: validate(parseRecordQuery, 'query'),
  validateSummaryQuery: validate(parseSummaryQuery, 'query'),
  validateReward: validate(parseEntry(REWARD_REASONS, ['amount'])),
  validateDeduction: validate(parseEntry(DEDUCTION_REASONS, ['totalAmount', 'monthlyAmount'])),
  validateEntryQuery: validate(parseEntryQuery, 'query'),
};
