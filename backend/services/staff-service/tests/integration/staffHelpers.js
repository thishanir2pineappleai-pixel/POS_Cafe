// Shared fixtures for the Staff Management tests (not a test file).
//   * Account 1: owner (id 9000), admin (id 9001), shop 1 and shop 2. Account 2: owner (id 9100) with shop 3.
//   * Slow things (password hashing) are avoided for bulk data: seedStaff() inserts rows straight into the in-memory
//     repository. Tests of the HTTP create endpoint use the real API.
const { staffRepository, staffRoleRepository, shiftRepository } = require('../../repositories');
const { normalizePhone } = require('@pos-cafe/shared/validator');
const { addShop, createUser, tokenFor } = require('./helpers');

const OWNER = 9000;
const ADMIN = 9001;
const OTHER_OWNER = 9100;

// Creates the users and shops, and returns their tokens.
async function setupAccounts({ ttlSeconds = 3600 } = {}) {
  await createUser({ id: OWNER, accountId: 1, role: 'owner', email: 'owner@poscafe.com' });
  await createUser({ id: ADMIN, accountId: 1, role: 'admin', email: 'admin@poscafe.com' });
  await createUser({ id: OTHER_OWNER, accountId: 2, role: 'owner', email: 'other@elsewhere.com' });
  const shop1 = await addShop(1, 'Main Shop');
  const shop2 = await addShop(1, 'Second Shop');
  const shop3 = await addShop(2, 'Other Account Shop');
  return {
    owner: (await tokenFor(OWNER, { ttlSeconds })).token,
    admin: (await tokenFor(ADMIN, { ttlSeconds })).token,
    other: (await tokenFor(OTHER_OWNER, { ttlSeconds })).token,
    shop1: shop1.id, shop2: shop2.id, shop3: shop3.id,
  };
}

const bearer = (token) => ({ authorization: `Bearer ${token}` });

// A role/team/shift row made straight in the repository.
const makeRole = (shopId, name, grants = {}, accountId = 1) => staffRoleRepository.roles.create({ accountId, shopId, name, grants });
const makeTeam = (shopId, name, accountId = 1) => staffRoleRepository.teams.create({ accountId, shopId, name });
const makeShift = (shopId, name, startTime, endTime, over = {}, accountId = 1) => shiftRepository.create({ accountId, shopId, name, startTime, endTime, active: true, ...over });

let counter = 0;
// A staff row made straight in the repository (a fake password hash, no slow hashing).
async function seedStaff({ shopId, accountId = 1, roleId, teamId, shiftId, workingDays = ['mon', 'tue', 'wed', 'thu', 'fri'], ...over }) {
  counter += 1;
  const n = counter;
  const phone = `071 ${String(1000000 + n).slice(-7)}`;
  const data = {
    accountId, shopId, name: `Staff ${n}`, gender: 'Male', phone, phoneNormalized: normalizePhone(phone), email: `staff${n}@paipos.com`,
    nic: `19900000${String(n).padStart(4, '0')}`, dob: '1990-01-01', address: 'Kandy', emergencyContact: { name: 'Robert', relationship: 'Brother', phone: '0711234567' },
    imagePath: null, joinDate: '2020-01-01', roleId, teamId, employmentType: 'Fulltime', active: true, inactiveReason: null, shiftId, workingDays,
    hoursPerWeek: 40, username: `user${n}`, usernameKey: `user${n}`, passwordHash: 'not-a-real-hash',
    salary: { type: 'Monthly', basic: 60000, overtime: false, otRate: null, paymentMethod: 'Cash', bankName: null, accountNumber: null },
    epf: { allowed: false, employerNumber: null, employeeNumber: null, employeeRate: 8, employerRate: 12, etfRate: 3 },
    documents: { cv: null, idCopy: null, agreement: null },
    ...over,
  };
  const roster = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, workingDays.includes(d) ? shiftId : 'off']));
  return staffRepository.create(data, roster);
}

// A complete valid body for POST /staff.
const staffBody = ({ roleId, teamId, shiftId }, over = {}) => ({
  name: 'Kumari Perera', gender: 'Female', phone: '071 555 1234', email: 'Kumari.Perera@PaiPos.com', nic: '1996 1234 5678', dob: '2001-04-21',
  address: '478, Meekanuwa Road, Kandy', emergencyContact: { name: 'Nimal', relationship: 'Brother', phone: '071 123 4567' },
  joinDate: '2025-05-01', roleId, teamId, employmentType: 'Fulltime', shiftId, workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'], hoursPerWeek: 40,
  username: 'kumari', password: 'Abc@1234',
  salary: { type: 'Monthly', basic: 60000, overtime: true, otRate: 100, paymentMethod: 'Bank Transfer', bankName: 'BOC - Jaffna', accountNumber: '1234 4567 8910' },
  epf: { allowed: true, employerNumber: '123456/A', employeeNumber: '00789' },
  ...over,
});

// Minimal valid files (the upload checks read the bytes).
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-image-data'), Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');

function multipart(field, buffer, filename, type = 'application/octet-stream') {
  const form = new FormData();
  form.append(field, new Blob([buffer], { type }), filename);
  return form;
}

module.exports = {
  OWNER, ADMIN, OTHER_OWNER, setupAccounts, bearer, makeRole, makeTeam, makeShift, seedStaff, staffBody, PNG, PDF, multipart,
};
