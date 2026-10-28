// Creates an account together with its owner. The owner's first shop belongs to the Settings Service, which the caller
// asks right after this (and undoes this with removeOwner if that fails, so no half-created account stays behind).
const { nextId } = require('./store');
const adminProfileRepository = require('./adminProfileRepository');

module.exports = {
  // owner: user columns. Returns { accountId, owner }.
  async createWithOwner({ owner }) {
    const accountId = nextId('accounts');
    return { accountId, owner: await adminProfileRepository.create({ ...owner, accountId }) };
  },
  async removeOwner(ownerId) {
    await adminProfileRepository.remove(ownerId);
  },
};
