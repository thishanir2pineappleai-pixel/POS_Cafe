// MySQL (Prisma) STAFF repository: the same methods and the same row shape as repositories/memory/staffRepository.js.
// The row the services use has nested parts (emergencyContact, salary, epf, documents); in MySQL they are real columns and
// a documents table, converted here in both directions so the services cannot tell the drivers apart.
//
// Uniqueness is enforced by the database (unique keys: shop + email, shop + phone, shop + NIC, shop + code, account + username)
// and reported as DuplicateError(field) exactly like the in-memory driver. Removed staff are only marked (deletedAt): they
// disappear from every list and lookup, but their values stay reserved, so the same email, phone, NIC or code cannot be reused
// while the record can still be restored. Creating a staff member and its roster is ONE transaction.
const { prisma } = require('./client');
const { DuplicateError } = require('../errors');
const { toDate, dateText } = require('./scoped');

const WITH = { documents: true };
const COLUMNS = [
  'name', 'gender', 'phone', 'phoneNormalized', 'email', 'nic', 'address', 'roleId', 'teamId', 'shiftId', 'employmentType', 'active',
  'inactiveReason', 'workingDays', 'hoursPerWeek', 'username', 'usernameKey', 'passwordHash',
];
const num = (v) => (v === null || v === undefined ? null : Number(v));
const code = (n) => `STF${String(n).padStart(4, '0')}`;

function toDoc(d) {
  return { storedName: d.storedName, fileName: d.fileName, type: d.type, size: d.size, uploadedAt: d.uploadedAt.toISOString() };
}

function toRow(r) {
  if (!r) return null;
  const {
    emergencyName, emergencyRelationship, emergencyPhone, documents, salaryType, salaryBasic, salaryOvertime, salaryOtRate, salaryPaymentMethod,
    salaryBankName, salaryAccountNumber, epfAllowed, epfEmployerNumber, epfEmployeeNumber, epfEmployeeRate, epfEmployerRate, epfEtfRate, ...rest
  } = r;
  const docs = { cv: null, idCopy: null, agreement: null };
  for (const d of documents ?? []) docs[d.slot] = toDoc(d);
  return {
    ...rest,
    code: code(r.codeNumber),
    dob: dateText(r.dob),
    joinDate: dateText(r.joinDate),
    emergencyContact: { name: emergencyName, relationship: emergencyRelationship, phone: emergencyPhone },
    salary: salaryType === null ? null : {
      type: salaryType, basic: num(salaryBasic), overtime: salaryOvertime, otRate: num(salaryOtRate), paymentMethod: salaryPaymentMethod, bankName: salaryBankName, accountNumber: salaryAccountNumber,
    },
    epf: epfAllowed === null ? null : {
      allowed: epfAllowed, employerNumber: epfEmployerNumber, employeeNumber: epfEmployeeNumber, employeeRate: num(epfEmployeeRate), employerRate: num(epfEmployerRate), etfRate: num(epfEtfRate),
    },
    documents: docs,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// Only the fields present in `data` are written, so a PATCH changes only what it sends. emergencyContact, salary and epf are
// replaced as a whole section (a section that is sent is complete, or null to clear it).
function toData(data) {
  const out = {};
  for (const f of COLUMNS) if (data[f] !== undefined) out[f] = data[f];
  if (data.dob !== undefined) out.dob = toDate(data.dob);
  if (data.joinDate !== undefined) out.joinDate = toDate(data.joinDate);
  if (data.emergencyContact !== undefined) {
    const c = data.emergencyContact;
    Object.assign(out, { emergencyName: c.name, emergencyRelationship: c.relationship, emergencyPhone: c.phone });
  }
  if (data.salary !== undefined) {
    const s = data.salary;
    Object.assign(out, s === null
      ? { salaryType: null, salaryBasic: null, salaryOvertime: null, salaryOtRate: null, salaryPaymentMethod: null, salaryBankName: null, salaryAccountNumber: null }
      : { salaryType: s.type, salaryBasic: s.basic, salaryOvertime: s.overtime, salaryOtRate: s.otRate, salaryPaymentMethod: s.paymentMethod, salaryBankName: s.bankName, salaryAccountNumber: s.accountNumber });
  }
  if (data.epf !== undefined) {
    const e = data.epf;
    Object.assign(out, e === null
      ? { epfAllowed: null, epfEmployerNumber: null, epfEmployeeNumber: null, epfEmployeeRate: null, epfEmployerRate: null, epfEtfRate: null }
      : { epfAllowed: e.allowed, epfEmployerNumber: e.employerNumber, epfEmployeeNumber: e.employeeNumber, epfEmployeeRate: e.employeeRate, epfEmployerRate: e.employerRate, epfEtfRate: e.etfRate });
  }
  return out;
}

// The first rule the values would break (removed staff included, because their values stay reserved), or null.
async function findDuplicate(db, v, exceptId) {
  const other = exceptId ? { id: { not: exceptId } } : {};
  const taken = async (where) => (await db.staff.count({ where: { ...other, ...where } })) > 0;
  if (await taken({ accountId: v.accountId, usernameKey: v.usernameKey })) return 'username';
  if (await taken({ shopId: v.shopId, email: v.email })) return 'email';
  if (await taken({ shopId: v.shopId, phoneNormalized: v.phoneNormalized })) return 'phone';
  if (await taken({ shopId: v.shopId, nic: v.nic })) return 'nic';
  return null;
}

const rosterRows = (staffId, days) => Object.entries(days).map(([weekday, v]) => ({ staffId, weekday, shiftId: v === 'off' ? null : v, isOff: v === 'off' }));

module.exports = {
  // Staff of one shop (not removed ones), newest first.
  async list(shopId) {
    return (await prisma.staff.findMany({ where: { shopId, deletedAt: null }, orderBy: { id: 'desc' }, include: WITH })).map(toRow);
  },
  // A staff member of the caller's account. Removed staff are only found with { withRemoved: true }.
  async findById(accountId, id, { withRemoved = false } = {}) {
    const row = await prisma.staff.findUnique({ where: { id }, include: WITH });
    if (!row || row.accountId !== accountId) return null;
    return withRemoved || !row.deletedAt ? toRow(row) : null;
  },
  // data holds every column except id/code/timestamps; rosterDays is stored with it in the same transaction.
  async create(data, rosterDays) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          const field = await findDuplicate(tx, data, null);
          if (field) throw new DuplicateError(field);
          const last = await tx.staff.aggregate({ where: { shopId: data.shopId }, _max: { codeNumber: true } });
          const row = await tx.staff.create({
            data: { ...toData(data), accountId: data.accountId, shopId: data.shopId, imagePath: data.imagePath ?? null, codeNumber: (last._max.codeNumber ?? 0) + 1 },
          });
          await tx.shiftAssignment.createMany({ data: rosterRows(row.id, rosterDays) });
          return toRow(await tx.staff.findUnique({ where: { id: row.id }, include: WITH }));
        });
      } catch (err) {
        if (err.code !== 'P2002') throw err;
        const field = await findDuplicate(prisma, data, null);
        if (field) throw new DuplicateError(field); // a request that raced us took the value first
        if (attempt >= 4) throw err; // two creations took the same code number: try again
      }
    }
  },
  // Changes only the fields in patch; null when the staff member does not exist. rosterDays (optional) replaces the roster.
  async update(id, patch, rosterDays) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.staff.findUnique({ where: { id } });
        if (!existing) return null;
        const merged = {
          accountId: existing.accountId, shopId: existing.shopId, usernameKey: patch.usernameKey ?? existing.usernameKey,
          email: patch.email ?? existing.email, phoneNormalized: patch.phoneNormalized ?? existing.phoneNormalized, nic: patch.nic ?? existing.nic,
        };
        const field = await findDuplicate(tx, merged, id);
        if (field) throw new DuplicateError(field);
        await tx.staff.update({ where: { id }, data: toData(patch) });
        if (rosterDays) {
          await tx.shiftAssignment.deleteMany({ where: { staffId: id } });
          await tx.shiftAssignment.createMany({ data: rosterRows(id, rosterDays) });
        }
        return toRow(await tx.staff.findUnique({ where: { id }, include: WITH }));
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      const existing = await prisma.staff.findUnique({ where: { id } });
      const field = existing && (await findDuplicate(prisma, { ...existing, ...patch }, id));
      throw field ? new DuplicateError(field) : err;
    }
  },
  // removedAt: an ISO string to remove, or null to restore. null when the staff member does not exist.
  async setRemoved(id, removedAt) {
    try {
      return toRow(await prisma.staff.update({ where: { id }, data: { deletedAt: removedAt ? new Date(removedAt) : null }, include: WITH }));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  },
  // Returns the previous file name (or null), or undefined when the staff member does not exist.
  async setImagePath(id, imagePath) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({ where: { id }, select: { imagePath: true } });
      if (!existing) return undefined;
      await tx.staff.update({ where: { id }, data: { imagePath } });
      return existing.imagePath;
    });
  },
  // type: 'cv' | 'idCopy' | 'agreement'. Replaces (or, with doc null, removes) the document; returns the previous one (or null).
  async setDocument(id, type, doc) {
    return prisma.$transaction(async (tx) => {
      const previous = await tx.staffDocument.findUnique({ where: { staffId_slot: { staffId: id, slot: type } } });
      if (doc === null) {
        await tx.staffDocument.deleteMany({ where: { staffId: id, slot: type } });
      } else {
        const data = { storedName: doc.storedName, fileName: doc.fileName, type: doc.type, size: doc.size, uploadedAt: new Date(doc.uploadedAt) };
        await tx.staffDocument.upsert({ where: { staffId_slot: { staffId: id, slot: type } }, create: { staffId: id, slot: type, ...data }, update: data });
      }
      await tx.staff.update({ where: { id }, data: { updatedAt: new Date() } });
      return previous ? toDoc(previous) : null;
    });
  },
  // How many staff (removed ones included) still use a role, team or shift: those cannot be deleted.
  async countUsing(shopId, field, value) {
    if (!['roleId', 'teamId', 'shiftId'].includes(field)) throw new Error(`countUsing does not support ${field}`);
    return prisma.staff.count({ where: { shopId, [field]: value } });
  },
};
