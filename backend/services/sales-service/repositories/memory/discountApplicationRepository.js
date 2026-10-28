// In-memory repository for Sales discount APPLICATIONS (temporary, see store.js: all data is lost on restart). Same methods and
// row shape as repositories/prisma/discountApplicationRepository.js. Applications belong to an ACCOUNT. The discount name and
// percentage are copies of the Menu definition made when the application was saved.
const { store, nextId, clone, now } = require('./store');
const { formatAppliesTo } = require('../../utils/formatter');

const searchableText = (a) => [a.discountName, 'Percentage', `${a.discountPercentage} %`, formatAppliesTo(a.appliesToAll, a.productIds.length), a.status];

module.exports = {
  // Newest first (PENDING APPROVAL).
  async list({ accountId, search, offset, limit }) {
    const needle = search ? search.toLowerCase() : null;
    const rows = [...store.discountApplications.values()]
      .filter((a) => a.accountId === accountId)
      .filter((a) => !needle || searchableText(a).some((t) => t && t.toLowerCase().includes(needle)))
      .sort((a, b) => b.id - a.id);
    return { total: rows.length, rows: rows.slice(offset, offset + limit).map(clone) };
  },

  async findById(id, { accountId }) {
    const app = store.discountApplications.get(id);
    return app && app.accountId === accountId ? clone(app) : null;
  },

  // data: { accountId, discountId, discountName, discountPercentage, startDate, endDate, status, appliesToAll, productIds }
  // With MySQL: one row in discount_applications plus rows in discount_application_products, in one transaction.
  async create(data) {
    const stamp = now();
    const app = { id: nextId('discountApplications'), ...data, productIds: [...data.productIds], createdAt: stamp, updatedAt: stamp };
    store.discountApplications.set(app.id, app);
    return clone(app);
  },

  // Replaces everything but the account; null when it does not exist in this account.
  async update(id, { accountId }, data) {
    const existing = store.discountApplications.get(id);
    if (!existing || existing.accountId !== accountId) return null;
    const app = { ...existing, ...data, accountId, productIds: [...data.productIds], updatedAt: now() };
    store.discountApplications.set(id, app);
    return clone(app);
  },

  async setStatus(id, { accountId }, status) {
    const app = store.discountApplications.get(id);
    if (!app || app.accountId !== accountId) return null;
    app.status = status;
    app.updatedAt = now();
    return clone(app);
  },

  // Removes only the application. Returns true when it existed.
  async remove(id, { accountId }) {
    const app = store.discountApplications.get(id);
    if (!app || app.accountId !== accountId) return false;
    store.discountApplications.delete(id);
    return true;
  },

  // Active applications of the account whose period includes `date` ('YYYY-MM-DD').
  async findActiveOn({ accountId, date }) {
    return [...store.discountApplications.values()]
      .filter((a) => a.accountId === accountId && a.status === 'Active' && a.startDate <= date && date <= a.endDate)
      .map(clone);
  },
};
