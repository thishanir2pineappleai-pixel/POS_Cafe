// In-memory signup registrations (temporary, see store.js). A registration is NOT a user: nobody can sign in
// until it is activated. Secrets are kept only as hashes (token, password, access key).
//
// status: email_pending -> owner_pending -> phone_pending -> business_pending -> awaiting_activation -> activated
const { store, nextId, clone } = require('./store');

const sameEmail = (a, b) => a.toLowerCase() === b.toLowerCase();

module.exports = {
  async create(data) {
    const row = { id: nextId('registrations'), ...data };
    store.registrations.set(row.id, row);
    return clone(row);
  },
  async findById(id) {
    const row = store.registrations.get(id);
    return row ? clone(row) : null;
  },
  async findByTokenHash(tokenHash) {
    const row = [...store.registrations.values()].find((r) => r.tokenHash === tokenHash);
    return row ? clone(row) : null;
  },
  // The unfinished signup for an email, if any (activated ones are users now).
  async findOpenByEmail(email) {
    const row = [...store.registrations.values()].find((r) => r.status !== 'activated' && sameEmail(r.email, email));
    return row ? clone(row) : null;
  },
  async update(id, patch) {
    const row = store.registrations.get(id);
    if (!row) return null;
    Object.assign(row, patch);
    return clone(row);
  },
  async remove(id) {
    store.registrations.delete(id);
  },
};
