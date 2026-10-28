// Translates between the Staff forms (names, DD/MM/YYYY dates, "Mon" day labels, nested objects) and the Staff Service API
// (ids, ISO dates, lowercase days). The forms keep their own shape so the screens stay as designed.
import { formatSlash, fromISO, parseSlash, toISO } from '../../utils/formatDate.js';
import { blankStaff } from './staffConstants.js';

const slash = (iso) => (iso ? formatSlash(fromISO(iso)) : '');
const iso = (text) => toISO(parseSlash(String(text).trim()));
const capital = (day) => day.charAt(0).toUpperCase() + day.slice(1);
const str = (v) => (v === null || v === undefined ? '' : String(v));

// A staff record from the API -> the form shape. Salary, EPF and documents are only sent to the owner: for anyone else (or a
// record the owner has not completed yet) they stay at the blank defaults.
export function fromApi(s) {
  const base = blankStaff();
  const docs = { cv: null, idCopy: null, agreement: null };
  for (const key of Object.keys(docs)) if (s.documents?.[key]) docs[key] = { name: s.documents[key].fileName, size: s.documents[key].size, remote: true };
  return {
    ...base,
    id: s.id,
    code: s.code,
    name: s.name,
    gender: s.gender,
    image: s.image, // a server path: fetch it with the token (useBlobUrl); never put it in an <img src>
    phone: s.phone,
    email: s.email,
    nic: s.nic,
    dob: slash(s.dob),
    address: s.address,
    emergency: { name: s.emergencyContact.name, relationship: s.emergencyContact.relationship, phone: s.emergencyContact.phone },
    joinDate: slash(s.employment.joinDate),
    role: s.role?.name ?? '',
    roleId: s.role?.id,
    team: s.team?.name ?? '',
    teamId: s.team?.id,
    shift: s.shift?.name ?? '',
    shiftId: s.shift?.id,
    employmentType: s.employment.employmentType,
    active: s.active,
    inactiveReason: str(s.employment.inactiveReason),
    workingDays: s.employment.workingDays.map(capital),
    hoursPerWeek: str(s.employment.hoursPerWeek),
    username: s.employment.username,
    password: '',
    salary: s.salary ? {
      type: s.salary.type, basic: s.salary.basic, overtime: s.salary.overtime, otRate: s.salary.otRate ?? '',
      method: s.salary.paymentMethod, bank: str(s.salary.bankName), account: str(s.salary.accountNumber),
    } : base.salary,
    epf: s.epf ? {
      allowed: s.epf.allowed, employerNumber: str(s.epf.employerNumber), employeeNumber: str(s.epf.employeeNumber),
      employeeRate: s.epf.employeeRate, employerRate: s.epf.employerRate, etfRate: s.epf.etfRate,
    } : base.epf,
    docs,
    hasRecords: Boolean(s.salary),
    lastLogin: s.lastLogin,
  };
}

const amount = (v) => Number(String(v).replace(/,/g, ''));
const rate = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

function personal(v) {
  return {
    name: v.name.trim(),
    gender: v.gender,
    phone: v.phone.trim(),
    email: v.email.trim(),
    nic: v.nic.replace(/\s/g, ''),
    dob: iso(v.dob),
    address: v.address.trim(),
    emergencyContact: { name: v.emergency.name.trim(), relationship: v.emergency.relationship.trim(), phone: v.emergency.phone.trim() },
  };
}

// `lists` are the API's roles, teams and shifts: the form holds names, the API wants ids.
function employment(v, lists) {
  const idOf = (list, name) => list.find((x) => x.name === name)?.id;
  return {
    joinDate: iso(v.joinDate),
    roleId: idOf(lists.roles, v.role),
    teamId: idOf(lists.teams, v.team),
    shiftId: idOf(lists.shifts, v.shift),
    employmentType: v.employmentType,
    hoursPerWeek: Number(v.hoursPerWeek),
    workingDays: v.workingDays.map((d) => d.toLowerCase()),
    username: v.username.trim(),
  };
}

// Employment Records (owner only). Each group is sent complete or not at all.
function records(v) {
  const bank = v.salary.method === 'Bank Transfer';
  return {
    salary: {
      type: v.salary.type,
      basic: amount(v.salary.basic),
      overtime: Boolean(v.salary.overtime),
      ...(v.salary.overtime ? { otRate: amount(v.salary.otRate) } : {}),
      paymentMethod: v.salary.method,
      ...(bank ? { bankName: v.salary.bank.trim(), accountNumber: v.salary.account.trim() } : {}),
    },
    epf: {
      allowed: Boolean(v.epf.allowed),
      ...(v.epf.allowed ? { employerNumber: v.epf.employerNumber.trim(), employeeNumber: v.epf.employeeNumber.trim() } : {}),
      employeeRate: rate(v.epf.employeeRate),
      employerRate: rate(v.epf.employerRate),
      etfRate: rate(v.epf.etfRate),
    },
  };
}

// POST /staff body. `withRecords`: the signed-in user is the owner.
export function createBody(v, lists, { withRecords }) {
  return {
    ...personal(v),
    ...employment(v, lists),
    password: v.password,
    active: v.active,
    ...(v.active ? {} : { inactiveReason: v.inactiveReason.trim() }),
    ...(withRecords ? records(v) : {}),
  };
}

// PATCH /staff/:id body: everything the screens can change except the status (a separate call, see statusChanged).
export function patchBody(v, lists, { withRecords }) {
  return { ...personal(v), ...employment(v, lists), ...(withRecords ? records(v) : {}) };
}

// The status has its own endpoint because the server wants a reason with it.
export const statusChanged = (before, after) => before.active !== after.active || (!after.active && before.inactiveReason !== after.inactiveReason);
