// TEMPORARY IN-MEMORY STORAGE of the Settings Service (development default, no database needed).
//
//   * Everything here is LOST WHEN THE SERVICE RESTARTS. Nothing is seeded: every collection starts empty.
//   * The Settings Service owns shop profiles only. Users and admin profiles belong to the Auth Service; a shop knows its
//     account and owner only by id (accountId, ownerId), never by copying user data.
//   * Uploaded logo FILES are written to services/settings-service/uploads/settings and are NOT lost on restart, but the
//     shops that reference them are, so old files become orphans until database persistence exists.
const clock = require('@pos-cafe/shared/clock');

const emptyStore = () => ({
  // id -> { id, accountId, ownerId, name, address, phone, email, website, timezone, imagePath, createdAt, updatedAt }
  shopProfiles: new Map(),
  lastId: { shopProfiles: 0 },
});

const store = emptyStore();

function nextId(table) {
  store.lastId[table] += 1;
  return store.lastId[table];
}

// Used by the automated tests to start from empty collections.
function reset() {
  Object.assign(store, emptyStore());
  clock.reset();
}

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();

module.exports = { store, nextId, reset, clone, now };
