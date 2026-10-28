// Client-side checks for the Staff Management forms. Each function returns an object { fieldKey: message }; empty means valid.
// The Figma marks no field optional, so every visible field is required unless it is hidden by a toggle (overtime, EPF/ETF,
// bank details for Cash, inactive reason) or is the staff picture. Every format below is PENDING approval.
import { parseSlash } from '../api/formatDate.js';
import { checkPassword, PASSWORD_RULE_TEXT } from './authValidation.js';
import { DOCUMENT_SLOTS, MAX_DOC_BYTES } from '../pages/StaffManagement/staffConstants.js';

const REQUIRED = 'This field is required';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blank = (v) => !String(v ?? '').trim();

// PENDING: Sri Lankan numbers, local (0711234567) or +94, spaces and dashes allowed.
const phoneProblem = (v) => {
  if (blank(v)) return REQUIRED;
  return /^(\+94|0)\d{9}$/.test(String(v).replace(/[\s-]/g, '')) ? '' : 'Enter a valid phone number, e.g. 071 123 4567';
};
// PENDING: the old 9-digit + V/X NIC or the new 12-digit NIC.
const nicProblem = (v) => {
  if (blank(v)) return REQUIRED;
  return /^(\d{9}[VvXx]|\d{12})$/.test(String(v).replace(/\s/g, '')) ? '' : 'Enter a valid NIC number';
};
const dateProblem = (v, { allowFuture }) => {
  if (blank(v)) return REQUIRED;
  const d = parseSlash(String(v));
  if (!d) return 'Use the format DD/MM/YYYY';
  return !allowFuture && d > new Date() ? 'The date cannot be in the future' : '';
};
const amountProblem = (v) => {
  if (blank(v)) return REQUIRED;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? '' : 'Enter an amount greater than 0';
};

export const toAmount = (v) => Number(String(v).replace(/,/g, ''));

function collect(rules) {
  const errors = {};
  for (const [key, problem] of Object.entries(rules)) if (problem) errors[key] = problem;
  return errors;
}

export function validatePersonal(v, { withContact = true } = {}) {
  return collect({
    name: blank(v.name) ? REQUIRED : '',
    gender: v.gender ? '' : REQUIRED,
    phone: phoneProblem(v.phone),
    email: blank(v.email) ? REQUIRED : (EMAIL.test(v.email.trim()) ? '' : 'Enter a valid email address'),
    nic: nicProblem(v.nic),
    dob: dateProblem(v.dob, { allowFuture: false }),
    address: blank(v.address) ? REQUIRED : '',
    ...(withContact ? validateEmergency(v.emergency, 'emergency.') : {}),
  });
}

export function validateEmergency(e, prefix = '') {
  return collect({
    [`${prefix}name`]: blank(e.name) ? REQUIRED : '',
    [`${prefix}relationship`]: blank(e.relationship) ? REQUIRED : '',
    [`${prefix}phone`]: phoneProblem(e.phone),
  });
}

// Step 2 of Add Staff. Edit mode has no System Access fields, so it passes needAccess: false.
export function validateEmployment(v, { needAccess = true } = {}) {
  const hours = Number(v.hoursPerWeek);
  return collect({
    joinDate: dateProblem(v.joinDate, { allowFuture: true }),
    role: v.role ? '' : REQUIRED,
    team: v.team ? '' : REQUIRED,
    employmentType: v.employmentType ? '' : REQUIRED,
    inactiveReason: !v.active && blank(v.inactiveReason) ? REQUIRED : '',
    shift: v.shift ? '' : REQUIRED,
    workingDays: v.workingDays.length ? '' : 'Select at least one working day',
    hoursPerWeek: blank(v.hoursPerWeek) ? REQUIRED : (Number.isFinite(hours) && hours > 0 && hours <= 168 ? '' : 'Enter hours between 1 and 168'),
    ...(needAccess ? {
      username: blank(v.username) ? REQUIRED : (/^\S{3,}$/.test(v.username.trim()) ? '' : 'Use at least 3 characters, no spaces'),
      password: !v.password ? REQUIRED : (checkPassword(v.password).ok ? '' : PASSWORD_RULE_TEXT),
    } : {}),
  });
}

export function validateSalary(s, prefix = 'salary.') {
  const bank = s.method === 'Bank Transfer';
  return collect({
    [`${prefix}basic`]: amountProblem(s.basic),
    [`${prefix}otRate`]: s.overtime ? amountProblem(s.otRate) : '',
    [`${prefix}method`]: s.method ? '' : REQUIRED,
    [`${prefix}bank`]: bank && blank(s.bank) ? REQUIRED : '',
    [`${prefix}account`]: bank && blank(s.account) ? REQUIRED : '',
  });
}

export function validateEpf(e, prefix = 'epf.') {
  const rate = (r) => (r === '' || (Number(r) >= 0 && Number(r) <= 100) ? '' : 'Enter 0 to 100');
  return collect({
    [`${prefix}employerNumber`]: e.allowed && blank(e.employerNumber) ? REQUIRED : '',
    [`${prefix}employeeNumber`]: e.allowed && blank(e.employeeNumber) ? REQUIRED : '',
    [`${prefix}employeeRate`]: rate(e.employeeRate),
    [`${prefix}employerRate`]: rate(e.employerRate),
    [`${prefix}etfRate`]: rate(e.etfRate),
  });
}

// Returns the problem with a chosen file (type or size), or '' when it is acceptable.
export function documentFileProblem(slotKey, file) {
  const slot = DOCUMENT_SLOTS.find((s) => s.key === slotKey);
  const ext = file.name.split('.').pop().toLowerCase();
  if (!slot.types.includes(ext)) return `Only ${slot.hint.split('(')[0].trim()} files are allowed`;
  return file.size > MAX_DOC_BYTES ? 'The file is larger than 5MB' : '';
}

export function validateDocuments(docs) {
  return collect(Object.fromEntries(DOCUMENT_SLOTS.map(({ key }) => [`docs.${key}`, docs[key] ? '' : 'Upload this document'])));
}

export function validateRecords(v) {
  return { ...validateSalary(v.salary), ...validateEpf(v.epf), ...validateDocuments(v.docs) };
}
