// Validation for shifts and the weekly roster (Shift tab).
const { WEEKDAYS } = require('../../config/constants/staff');
const { parsePagination } = require('@pos-cafe/shared/pagination');
const { isPlainObject, toInt } = require('@pos-cafe/shared/validator');
const { notAnObject, queryOneOf, queryText, reader } = require('@pos-cafe/shared/reader');
const { validate } = require('@pos-cafe/shared/validate');

// POST /shifts (all fields) and PUT /shifts/:id (name optional): "Update Shift" has Start Time and End Time.
// PENDING APPROVAL: a shift may not start and end at the same minute; an end earlier than the start means it runs past midnight
// (the Night shift 10:00 PM - 06:00 AM in the Figma).
function shiftParser(creating) {
  return (req) => {
    if (!isPlainObject(req.body)) return notAnObject();
    const errors = [];
    const r = reader(req.body, errors);
    const value = {
      name: r.text('name', { required: creating, max: 50 }),
      startTime: r.time('startTime'),
      endTime: r.time('endTime'),
    };
    if (value.startTime && value.startTime === value.endTime) r.fail('endTime', 'Must differ from the start time');
    if (creating) value.active = req.body.active === undefined ? true : r.bool('active');
    if (value.name === undefined) delete value.name;
    return { value, errors };
  };
}

function parseStatus(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const errors = [];
  return { value: { active: reader(req.body, errors).bool('active') }, errors };
}

// PUT /shifts/roster/:staffId body: a shift id or off:true, and how far it applies (the Add/Edit Shift dialogs).
function parseAssign(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const errors = [];
  const r = reader(req.body, errors);
  const hasShift = req.body.shiftId !== undefined && req.body.shiftId !== null;
  const off = req.body.off === undefined ? false : r.bool('off');
  if (hasShift === (off === true)) r.fail('shiftId', 'Send exactly one of shiftId or off: true');
  const value = {
    shiftId: hasShift ? r.int('shiftId', { min: 1 }) : null,
    off: off === true,
    applyTo: r.oneOf('applyTo', ['day', 'week_without_off', 'week']), // "This day only", "Whole week without off day", "Whole week"
  };
  if (value.applyTo === 'day') {
    const day = typeof req.body.day === 'string' ? req.body.day.toLowerCase() : req.body.day;
    if (!WEEKDAYS.includes(day)) r.fail('day', `Required for applyTo "day": one of ${WEEKDAYS.join(', ')}`);
    else value.day = day;
  }
  return { value, errors };
}

// DELETE /shifts/roster/:staffId?day= : clear one day, or the whole week when no day is given.
function parseClear(req) {
  const errors = [];
  const day = queryOneOf(req.query, 'day', WEEKDAYS, errors);
  const shopRaw = req.query.shopId;
  return { value: { day, shopId: shopRaw === undefined ? undefined : toInt(shopRaw, { min: 1 }) ?? undefined }, errors };
}

// GET /shifts/roster and its export. shift = a shift id or "off"; day = mon..sun (omitted = all days).
function parseRosterQuery(req) {
  const query = req.query;
  const errors = [];
  const { page, limit, errors: pageErrors } = parsePagination(query);
  errors.push(...pageErrors);
  let shift;
  if (query.shift !== undefined && query.shift !== '') {
    if (query.shift === 'off') shift = 'off';
    else {
      shift = toInt(query.shift, { min: 1 });
      if (shift === null) { errors.push({ field: 'shift', message: 'Must be a shift id or "off"' }); shift = undefined; }
    }
  }
  const shopRaw = query.shopId;
  const shopId = shopRaw === undefined || shopRaw === '' ? undefined : toInt(shopRaw, { min: 1 });
  if (shopId === null) errors.push({ field: 'shopId', message: 'Must be a positive whole number' });
  return {
    value: {
      q: queryText(query, 'q', errors), shift, day: queryOneOf(query, 'day', WEEKDAYS, errors), page, limit, shopId: shopId ?? undefined,
      format: queryOneOf(query, 'format', ['csv', 'pdf', 'xls'], errors),
    },
    errors,
  };
}

module.exports = {
  validateShiftCreate: validate(shiftParser(true)),
  validateShiftUpdate: validate(shiftParser(false)),
  validateShiftStatus: validate(parseStatus),
  validateAssign: validate(parseAssign),
  validateClear: validate(parseClear, 'query'),
  validateRosterQuery: validate(parseRosterQuery, 'query'),
};
