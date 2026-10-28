// Validation for the Staff Management staff endpoints. Every request value is read through an allow-list, so shopId,
// accountId, code, permissions, passwordHash, imagePath and anything else a client adds are ignored.
//
// CONFIRMED by the Figma: the fields, the option lists, the status/reason, and the 2 MB image / 5 MB documents.
// PENDING APPROVAL (the Figma states no formats): the phone, NIC, username and length rules below, and that every
// Personal / Employment field is required (the designs mark none optional). Employment Records (salary, EPF/ETF) are
// optional here so the Owner can complete them later; they are validated completely whenever they are sent.
const {
  DEFAULT_WORKING_DAYS, EMPLOYMENT_TYPES, GENDERS, PAYMENT_METHODS, SALARY_TYPES, WEEKDAYS,
} = require('../../config/constants/staff');
const { parsePagination } = require('@pos-cafe/shared/pagination');
const {
  isEmail, isPlainObject, normalizePhone, passwordProblem, toPhone, toInt,
} = require('@pos-cafe/shared/validator');
const clock = require('@pos-cafe/shared/clock');
const { localDate } = require('@pos-cafe/shared/date');
const { notAnObject, queryOneOf, queryText, reader } = require('@pos-cafe/shared/reader');
const { validate } = require('@pos-cafe/shared/validate');

const NIC = /^(\d{9}[VX]|\d{12})$/;

function readPhone(r, source, field, errors, prefix = '') {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === '') { r.fail(field, 'Required'); return undefined; }
  const phone = toPhone(raw);
  if (!phone) { errors.push({ field: prefix + field, message: 'Must be a phone number with 9-15 digits' }); return undefined; }
  return phone;
}

function personalFields(body, errors, req) {
  const r = reader(body, errors);
  const value = {};
  const set = (key, v) => { if (v !== undefined) value[key] = v; };
  if (req || r.has('name')) set('name', r.text('name', { max: 150 }));
  if (req || r.has('gender')) set('gender', r.oneOf('gender', GENDERS));
  if (req || r.has('phone')) {
    const phone = readPhone(r, body, 'phone', errors);
    if (phone) { set('phone', phone); set('phoneNormalized', normalizePhone(phone)); }
  }
  if (req || r.has('email')) {
    const email = r.text('email', { max: 254 });
    if (email !== undefined && !isEmail(email)) r.fail('email', 'Must be a valid email address');
    else set('email', email && email.toLowerCase());
  }
  if (req || r.has('nic')) {
    const text = r.text('nic', { max: 20 });
    const nic = text && text.replace(/\s/g, '').toUpperCase();
    if (nic !== undefined && !NIC.test(nic)) r.fail('nic', 'Must be a 12-digit NIC, or 9 digits followed by V or X');
    else set('nic', nic);
  }
  if (req || r.has('dob')) {
    const dob = r.date('dob');
    if (dob !== undefined && (dob > localDate(clock.now()) || dob < '1900-01-01')) r.fail('dob', 'Must be a past date');
    else set('dob', dob);
  }
  if (req || r.has('address')) set('address', r.text('address', { max: 255 }));
  if (req || r.has('emergencyContact')) {
    const contact = r.object('emergencyContact');
    if (contact) {
      const c = reader(contact, errors, 'emergencyContact.');
      const phone = readPhone(c, contact, 'phone', errors, 'emergencyContact.');
      value.emergencyContact = { name: c.text('name', { max: 150 }), relationship: c.text('relationship', { max: 100 }), phone };
    }
  }
  return value;
}

function employmentFields(body, errors, req) {
  const r = reader(body, errors);
  const value = {};
  const set = (key, v) => { if (v !== undefined) value[key] = v; };
  if (req || r.has('joinDate')) set('joinDate', r.date('joinDate'));
  if (req || r.has('roleId')) set('roleId', r.int('roleId', { min: 1 }));
  if (req || r.has('teamId')) set('teamId', r.int('teamId', { min: 1 }));
  if (req || r.has('employmentType')) set('employmentType', r.oneOf('employmentType', EMPLOYMENT_TYPES));
  if (req || r.has('shiftId')) set('shiftId', r.int('shiftId', { min: 1 }));
  if (req || r.has('hoursPerWeek')) set('hoursPerWeek', r.int('hoursPerWeek', { min: 1, max: 168 }));
  if (req || r.has('workingDays')) {
    const days = body.workingDays === undefined ? DEFAULT_WORKING_DAYS : body.workingDays;
    const clean = Array.isArray(days) ? days.map((d) => (typeof d === 'string' ? d.toLowerCase() : d)) : null;
    if (!clean || clean.length === 0 || clean.some((d) => !WEEKDAYS.includes(d)) || new Set(clean).size !== clean.length) {
      r.fail('workingDays', `Must be 1-7 different days from: ${WEEKDAYS.join(', ')}`);
    } else set('workingDays', WEEKDAYS.filter((d) => clean.includes(d)));
  }
  if (req || r.has('username')) {
    const username = r.text('username', { max: 50 });
    if (username !== undefined && !/^\S{3,50}$/.test(username)) r.fail('username', 'Must be 3-50 characters without spaces');
    else if (username !== undefined) { set('username', username); set('usernameKey', username.toLowerCase()); }
  }
  return value;
}

// Employment Records: salary + EPF/ETF. A group that is sent must be complete (the Edit dialogs replace a whole section).
function recordFields(body, errors) {
  const value = {};
  if (body.salary !== undefined) {
    const r0 = reader(body, errors);
    const salary = r0.object('salary');
    if (salary) {
      const r = reader(salary, errors, 'salary.');
      const method = r.oneOf('paymentMethod', PAYMENT_METHODS);
      const overtime = r.bool('overtime');
      const bank = method === 'Bank Transfer';
      value.salary = {
        type: r.oneOf('type', SALARY_TYPES),
        basic: r.amount('basic', { positive: true }),
        overtime,
        otRate: overtime ? r.amount('otRate', { positive: true }) : null,
        paymentMethod: method,
        bankName: bank ? r.text('bankName', { max: 100 }) : null,
        accountNumber: bank ? r.text('accountNumber', { max: 50 }) : null,
      };
    }
  }
  if (body.epf !== undefined) {
    const r0 = reader(body, errors);
    const epf = r0.object('epf');
    if (epf) {
      const r = reader(epf, errors, 'epf.');
      const allowed = r.bool('allowed');
      const rate = (field, fallback) => {
        const n = r.amount(field, { required: false });
        return n !== undefined && n > 100 ? r.fail(field, 'Must be 0 to 100') : (n ?? fallback);
      };
      value.epf = {
        allowed,
        employerNumber: allowed ? r.text('employerNumber', { max: 50 }) : null,
        employeeNumber: allowed ? r.text('employeeNumber', { max: 50 }) : null,
        employeeRate: rate('employeeRate', 8), // the Figma's statutory defaults: 8 % / 12 % / 3 %
        employerRate: rate('employerRate', 12),
        etfRate: rate('etfRate', 3),
      };
    }
  }
  return value;
}

// POST /staff body
function parseCreate(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];
  const r = reader(body, errors);
  const value = { ...personalFields(body, errors, true), ...employmentFields(body, errors, true), ...recordFields(body, errors) };
  const active = body.active === undefined ? true : r.bool('active');
  value.active = active;
  value.inactiveReason = active === false ? r.text('inactiveReason', { max: 255 }) : null;
  const password = body.password;
  const problem = passwordProblem(password);
  if (problem) errors.push({ field: 'password', message: problem });
  else value.password = password; // never trimmed, never echoed
  return { value, errors };
}

// PATCH /staff/:id body: any of the personal, employment or record fields; only what is sent is changed.
// Status goes through PUT /staff/:id/status and the password is not editable (the Edit designs have no password field).
function parseUpdate(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];
  const value = { ...personalFields(body, errors, false), ...employmentFields(body, errors, false), ...recordFields(body, errors) };
  if (errors.length === 0 && Object.keys(value).length === 0) errors.push({ field: 'body', message: 'Send at least one field to change' });
  return { value, errors };
}

// PUT /staff/:id/status body
function parseStatus(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];
  const r = reader(body, errors);
  const active = r.bool('active');
  const inactiveReason = active === false ? r.text('inactiveReason', { max: 255 }) : null;
  return { value: { active, inactiveReason }, errors };
}

// GET /staff and GET /staff/summary
function parseListQuery(req) {
  const query = req.query;
  const errors = [];
  const { page, limit, errors: pageErrors } = parsePagination(query);
  errors.push(...pageErrors);
  const id = (field) => {
    if (query[field] === undefined || query[field] === '') return undefined;
    const n = toInt(query[field], { min: 1 });
    if (n === null) errors.push({ field, message: 'Must be a positive whole number' });
    return n ?? undefined;
  };
  const value = {
    q: queryText(query, 'q', errors),
    roleId: id('roleId'),
    teamId: id('teamId'),
    shiftId: id('shiftId'),
    status: queryOneOf(query, 'status', ['active', 'inactive'], errors),
    shopId: id('shopId'),
    page,
    limit,
  };
  return { value, errors };
}

module.exports = {
  validateStaffCreate: validate(parseCreate),
  validateStaffUpdate: validate(parseUpdate),
  validateStaffStatus: validate(parseStatus),
  validateStaffQuery: validate(parseListQuery, 'query'),
  parseCreate,
};
