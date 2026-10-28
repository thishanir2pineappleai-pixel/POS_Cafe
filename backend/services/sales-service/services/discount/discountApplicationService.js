// Sales discount APPLICATIONS: a Menu discount definition applied over a period to all products or to chosen products.
// The definition (name and percentage) is owned by the Menu Service: it is asked there when an application is saved and the
// name and percentage are COPIED into the application (so a later Menu change never alters a saved application).
// Applications belong to the caller's ACCOUNT (PENDING APPROVAL: the plan proposes account level, like Menu).
// Pricing uses the Active applications (services/order/pricing.js); how an application and a product's own Menu discount
// combine has not been approved.
const { discountApplicationRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { buildMeta } = require('@pos-cafe/shared/pagination');
const { MESSAGES } = require('../../config/constants/messages');
const { DISCOUNT_APPLICATION_STATUS } = require('../../config/constants/orders');
const { formatAppliesTo } = require('../../utils/formatter');
const menuClient = require('../integration/menuClient');

const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.APPLICATION_NOT_FOUND);
const invalid = (errors) => new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.VALIDATION_FAILED, errors);

function toDto(row) {
  return {
    id: row.id,
    discountId: row.discountId,
    discountName: row.discountName,
    type: 'Percentage', // only percentage discounts exist in the designs
    value: row.discountPercentage,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    appliesToAll: row.appliesToAll,
    appliesTo: formatAppliesTo(row.appliesToAll, row.productIds.length), // "All Products" / "8 Products"
    productIds: row.productIds,
    productCount: row.productIds.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Checks the discount definition and the products exist in the Menu Service; returns the definition to copy.
async function checkReferences(value) {
  const errors = [];
  const [discount] = await menuClient.lookupDiscounts([value.discountId]);
  if (!discount) errors.push({ field: 'discountId', message: 'Discount does not exist' });
  if (!value.appliesToAll) {
    const found = new Set((await menuClient.lookupProducts(value.productIds)).map((p) => p.id));
    const missing = value.productIds.filter((id) => !found.has(id));
    if (missing.length) errors.push({ field: 'productIds', message: `Products do not exist: ${missing.join(', ')}` });
  }
  if (errors.length) throw invalid(errors);
  return discount;
}

const rowFrom = (accountId, value, discount, status) => ({
  accountId,
  discountId: discount.id,
  discountName: discount.name,
  discountPercentage: discount.percentage,
  startDate: value.startDate,
  endDate: value.endDate,
  status,
  appliesToAll: value.appliesToAll,
  productIds: [...value.productIds].sort((a, b) => a - b),
});

async function list(auth, { search, page, limit }) {
  const { rows, total } = await discountApplicationRepository.list({ accountId: auth.accountId, search, offset: (page - 1) * limit, limit });
  return { items: rows.map(toDto), meta: buildMeta(total, page, limit) };
}

async function get(auth, id) {
  const row = await discountApplicationRepository.findById(id, { accountId: auth.accountId });
  if (!row) throw notFound();
  return toDto(row);
}

async function create(auth, value) {
  const discount = await checkReferences(value);
  // PENDING APPROVAL: a new application is Active unless a status is given (the Figma list shows new rows as Active).
  const status = value.status ?? DISCOUNT_APPLICATION_STATUS.ACTIVE;
  return toDto(await discountApplicationRepository.create(rowFrom(auth.accountId, value, discount, status)));
}

// Replaces the discount, period and products. The status is kept unless one is given.
async function update(auth, id, value) {
  const existing = await discountApplicationRepository.findById(id, { accountId: auth.accountId });
  if (!existing) throw notFound();
  const discount = await checkReferences(value);
  const row = await discountApplicationRepository.update(id, { accountId: auth.accountId }, rowFrom(auth.accountId, value, discount, value.status ?? existing.status));
  if (!row) throw notFound();
  return toDto(row);
}

async function setStatus(auth, id, status) {
  const row = await discountApplicationRepository.setStatus(id, { accountId: auth.accountId }, status);
  if (!row) throw notFound();
  return toDto(row);
}

async function remove(auth, id) {
  if (!(await discountApplicationRepository.remove(id, { accountId: auth.accountId }))) throw notFound();
}

module.exports = { list, get, create, update, setStatus, remove };
