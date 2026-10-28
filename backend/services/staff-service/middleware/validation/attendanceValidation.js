// Validation for attendance and leave (Attendance tab and Leave Management).
const { ATTENDANCE_STATUS, HALVES, LEAVE_TYPES } = require('../../config/constants/staff');
const clock = require('@pos-cafe/shared/clock');
const { localDate, parseDateOnly } = require('@pos-cafe/shared/date');
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
const dateQuery = (query, field, errors) => {
  if (query[field] === undefined || query[field] === '') return undefined;
  const d = parseDateOnly(query[field]);
  if (!d) errors.push({ field, message: 'Must be a real date as YYYY-MM-DD' });
  return d ?? undefined;
};

// POST /attendance/check-in and /check-out: only the staff id. The time is ALWAYS the server's clock, never a client value.
function parseCheck(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const errors = [];
  return { value: { staffId: reader(req.body, errors).int('staffId', { min: 1 }) }, errors };
}

// GET /attendance (one day, default today) and its export.
function parseDayList(req) {
  const query = req.query;
  const errors = [];
  const { page, limit, errors: pageErrors } = parsePagination(query);
  errors.push(...pageErrors);
  return {
    value: {
      date: dateQuery(query, 'date', errors) ?? localDate(clock.now()),
      q: queryText(query, 'q', errors),
      roleId: idQuery(query, 'roleId', errors),
      staffId: idQuery(query, 'staffId', errors),
      status: queryOneOf(query, 'status', Object.values(ATTENDANCE_STATUS), errors),
      shopId: idQuery(query, 'shopId', errors),
      page, limit,
      format: queryOneOf(query, 'format', ['csv', 'pdf', 'xls'], errors),
    },
    errors,
  };
}

function parseDayOnly(req) {
  const errors = [];
  return { value: { date: dateQuery(req.query, 'date', errors) ?? localDate(clock.now()) }, errors };
}

// POST/PUT /attendance/leaves body. Hour Permission has a start and end time, Half Day a first/second half, Full Day only the date.
function parseLeave(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const errors = [];
  const r = reader(req.body, errors);
  const type = r.oneOf('type', Object.keys(LEAVE_TYPES));
  const value = {
    staffId: r.int('staffId', { min: 1 }),
    type,
    date: r.date('date'),
    startTime: null, endTime: null, half: null,
    reason: r.text('reason', { max: 255 }),
  };
  if (type === 'hour_permission') {
    value.startTime = r.time('startTime');
    value.endTime = r.time('endTime');
    if (value.startTime && value.endTime && value.endTime <= value.startTime) r.fail('endTime', 'Must be later than the start time');
  }
  if (type === 'half_day') value.half = r.oneOf('half', HALVES);
  return { value, errors };
}

function parseLeaveQuery(req) {
  const query = req.query;
  const errors = [];
  const { page, limit, errors: pageErrors } = parsePagination(query);
  errors.push(...pageErrors);
  return {
    value: {
      q: queryText(query, 'q', errors),
      type: queryOneOf(query, 'type', Object.keys(LEAVE_TYPES), errors),
      staffId: idQuery(query, 'staffId', errors),
      date: dateQuery(query, 'date', errors),
      shopId: idQuery(query, 'shopId', errors),
      page, limit,
      format: queryOneOf(query, 'format', ['csv', 'pdf', 'xls'], errors),
    },
    errors,
  };
}

module.exports = {
  validateCheck: validate(parseCheck),
  validateDayList: validate(parseDayList, 'query'),
  validateDayOnly: validate(parseDayOnly, 'query'),
  validateLeave: validate(parseLeave),
  validateLeaveQuery: validate(parseLeaveQuery, 'query'),
};
