// What the Menu Service tells other services (the Sales Service). Menu data stays here: callers get a small, read-only view
// by id and never touch the Menu database.
const { menuRepository, discountRepository } = require('../../repositories');
const { getStockStatus } = require('../../config/constants/status');
const { formatProductCode } = require('../../utils/formatter');
const imageService = require('../storage/imageService');

// Existing products among `ids` (a missing id is simply absent from the answer). sellingPrice is the unit price.
async function lookupProducts(ids) {
  const rows = await menuRepository.findByIds(ids);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    categoryName: p.categoryName,
    sellingPrice: p.sellingPrice,
    image: imageService.productImageUrl(p.imagePath),
  }));
}

// The discount definitions that exist among `ids`: [{ id, name, percentage }].
async function lookupDiscounts(ids) {
  const rows = await Promise.all(ids.map((id) => discountRepository.findById(id)));
  return rows.filter(Boolean).map((row) => ({ id: row.id, name: row.name, percentage: row.percentage }));
}

// The Dashboard "stock" card. Source: Menu PRODUCTS (there is no ingredient inventory), the whole catalogue.
async function stockOverview(limit) {
  const { counts, attention } = await menuRepository.stockOverview({ limit });
  return {
    source: 'menu_products',
    counts,
    items: attention.map((p) => ({
      id: p.id,
      code: formatProductCode(p.id),
      name: p.name,
      category: p.categoryName,
      quantity: p.quantity,
      lowStockAlert: p.lowStockAlert,
      status: getStockStatus(p.quantity, p.lowStockAlert),
    })),
  };
}

module.exports = { lookupProducts, lookupDiscounts, stockOverview };
