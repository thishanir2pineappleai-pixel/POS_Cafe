// In-memory product repository (temporary, see store.js). Returns rows shaped like a SQL join result:
// the product columns plus categoryName, discountName/discountPercentage and (for single products) ingredients.
// Deleting a product here only removes its own ingredient links. It must never touch order or payment history
// (those tables will reference products with ON DELETE SET NULL plus a snapshot of the product).
const { store, nextId, clone, now } = require('./store');
const { getStockStatus } = require('../../config/constants/status');
const { formatProductCode } = require('../../utils/formatter');

function withJoins(product) {
  const category = store.categories.get(product.categoryId);
  const discount = product.discountId ? store.discounts.get(product.discountId) : null;
  return {
    ...product,
    categoryName: category ? category.name : null,
    discountName: discount ? discount.name : null,
    discountPercentage: discount ? discount.percentage : null,
  };
}

function ingredientsOf(productId) {
  return (store.productIngredients.get(productId) || []).map((link) => ({
    ingredientId: link.ingredientId,
    name: store.ingredients.get(link.ingredientId).name,
    quantity: link.quantity,
  }));
}

const statusOf = (p) => getStockStatus(p.quantity, p.lowStockAlert);

module.exports = {
  // filters: { search, status (label), categoryId, sort ('price_asc' | 'price_desc' | null), offset, limit }
  async list({ search, status, categoryId, sort, offset, limit }) {
    const needle = search ? search.toLowerCase() : null;
    let rows = [...store.products.values()].map(withJoins).filter((p) => {
      if (status && statusOf(p) !== status) return false;
      if (categoryId && p.categoryId !== categoryId) return false;
      if (!needle) return true;
      return [p.name, formatProductCode(p.id), p.categoryName, statusOf(p)].some((text) => text && text.toLowerCase().includes(needle));
    });
    // PENDING APPROVAL: default order is newest first.
    rows = rows.sort((a, b) => {
      if (sort === 'price_asc' && a.sellingPrice !== b.sellingPrice) return a.sellingPrice - b.sellingPrice;
      if (sort === 'price_desc' && a.sellingPrice !== b.sellingPrice) return b.sellingPrice - a.sellingPrice;
      return b.id - a.id;
    });
    return { total: rows.length, rows: rows.slice(offset, offset + limit).map(clone) };
  },

  async findById(id) {
    const product = store.products.get(id);
    return product ? clone({ ...withJoins(product), ingredients: ingredientsOf(id) }) : null;
  },

  // data: product columns; links: [{ ingredientId, quantity }]
  // With MySQL this and update() run inside one transaction (product row plus its ingredient rows).
  async create(data, links) {
    const stamp = now();
    const product = { id: nextId('products'), ...data, imagePath: null, createdAt: stamp, updatedAt: stamp };
    store.products.set(product.id, product);
    store.productIngredients.set(product.id, links.map((l) => ({ ...l })));
    return clone(product);
  },

  async update(id, data, links) {
    const existing = store.products.get(id);
    if (!existing) return null;
    const product = { ...existing, ...data, updatedAt: now() };
    store.products.set(id, product);
    store.productIngredients.set(id, links.map((l) => ({ ...l })));
    return clone(product);
  },

  async remove(id) {
    const product = store.products.get(id);
    if (!product) return null;
    store.products.delete(id);
    store.productIngredients.delete(id);
    return clone(product);
  },

  // Returns true when the product had that ingredient.
  async updateIngredientQuantity(productId, ingredientId, quantity) {
    const link = (store.productIngredients.get(productId) || []).find((l) => l.ingredientId === ingredientId);
    if (!link) return false;
    link.quantity = quantity;
    store.products.get(productId).updatedAt = now();
    return true;
  },

  // Which of these ids are real products. One query with MySQL (WHERE id IN (?)).
  async existingIds(ids) {
    return ids.filter((id) => store.products.has(id));
  },

  // The products with these ids (joined rows, no ingredients); ids that do not exist are left out. Used by the internal
  // lookup the Sales Service calls.
  async findByIds(ids) {
    return ids.filter((id) => store.products.has(id)).map((id) => clone(withJoins(store.products.get(id))));
  },

  // Returns the previous image filename (or null), or undefined when the product does not exist.
  async setImagePath(id, imagePath) {
    const product = store.products.get(id);
    if (!product) return undefined;
    const previous = product.imagePath;
    product.imagePath = imagePath;
    product.updatedAt = now();
    return previous;
  },

  // Stock counts plus the products that need attention (out of stock first, then low stock, fewest units first).
  // Menu products have no owner/shop column yet, so this covers the whole catalogue.
  async stockOverview({ limit }) {
    const rows = [...store.products.values()].map(withJoins);
    const counts = { outOfStock: 0, lowStock: 0, inStock: 0 };
    for (const p of rows) {
      const status = statusOf(p);
      if (status === 'Out of stock') counts.outOfStock += 1;
      else if (status === 'Low Stock') counts.lowStock += 1;
      else counts.inStock += 1;
    }
    const rank = (p) => (statusOf(p) === 'Out of stock' ? 0 : 1);
    const attention = rows.filter((p) => statusOf(p) !== 'In Stock')
      .sort((a, b) => rank(a) - rank(b) || a.quantity - b.quantity || a.id - b.id)
      .slice(0, limit);
    return { counts, attention: attention.map(clone) };
  },

  // PENDING APPROVAL: "active" means not out of stock (inferred from the Figma card numbers).
  async counts() {
    const all = [...store.products.values()];
    const out = all.filter((p) => p.quantity <= 0).length;
    return { total: all.length, active: all.length - out, outOfStock: out };
  },
};
