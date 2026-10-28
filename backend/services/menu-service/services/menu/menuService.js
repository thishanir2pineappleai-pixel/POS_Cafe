// Product business logic. Talks only to the repositories (in-memory for now, MySQL later).
const {
  menuRepository, categoryRepository, discountRepository, ingredientRepository,
} = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { STATUS_FILTERS, getStockStatus } = require('../../config/constants/status');
const { formatIngredientCode, formatProductCode } = require('../../utils/formatter');
const { buildMeta } = require('@pos-cafe/shared/pagination');
const imageService = require('../storage/imageService');

const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.PRODUCT_NOT_FOUND);
const badRef = (field, message) => new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

function toDto(row) {
  const dto = {
    id: row.id,
    code: formatProductCode(row.id),
    name: row.name,
    categoryId: row.categoryId,
    category: row.categoryName,
    costPrice: row.costPrice,
    sellingPrice: row.sellingPrice,
    quantity: row.quantity,
    lowStockAlert: row.lowStockAlert,
    status: getStockStatus(row.quantity, row.lowStockAlert),
    discountId: row.discountId,
    discountType: row.discountName, // the discount's name, as the frontend calls it
    discountPercentage: row.discountPercentage,
    image: imageService.productImageUrl(row.imagePath),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.ingredients) {
    dto.ingredients = row.ingredients.map((i) => ({
      id: i.ingredientId, code: formatIngredientCode(i.ingredientId), name: i.name, quantity: i.quantity,
    }));
  }
  return dto;
}

// Splits validated input into product columns and ingredient links. Checks the category and discount exist
// first, then finds or creates the ingredients (with MySQL all of this runs in one transaction).
async function prepare(value) {
  if (!(await categoryRepository.findById(value.categoryId))) throw badRef('categoryId', 'Category does not exist');
  if (value.discountId && !(await discountRepository.findById(value.discountId))) throw badRef('discountId', 'Discount does not exist');
  const links = [];
  for (const item of value.ingredients) {
    const ingredient = await ingredientRepository.findOrCreateByName(item.name);
    links.push({ ingredientId: ingredient.id, quantity: item.quantity });
  }
  const { ingredients, ...columns } = value;
  return { columns, links };
}

async function list({ search, status, categoryId, sort, page, limit }) {
  const { rows, total } = await menuRepository.list({
    search, status: status ? STATUS_FILTERS[status] : null, categoryId, sort, offset: (page - 1) * limit, limit,
  });
  return { items: rows.map(toDto), meta: buildMeta(total, page, limit) };
}

async function summary() {
  const counts = await menuRepository.counts();
  return { ...counts, categories: await categoryRepository.count() };
}

async function get(id) {
  const row = await menuRepository.findById(id);
  if (!row) throw notFound();
  return toDto(row);
}

async function create(value) {
  const { columns, links } = await prepare(value);
  const created = await menuRepository.create(columns, links);
  return get(created.id);
}

async function update(id, value) {
  if (!(await menuRepository.findById(id))) throw notFound();
  const { columns, links } = await prepare(value);
  await menuRepository.update(id, columns, links);
  return get(id);
}

// Permanent delete (as the Figma says). Only the product, its ingredient links and its image file go.
async function remove(id) {
  const removed = await menuRepository.remove(id);
  if (!removed) throw notFound();
  await imageService.removeProductImage(removed.imagePath);
}

async function updateIngredientQuantity(productId, ingredientId, quantity) {
  if (!(await menuRepository.findById(productId))) throw notFound();
  const changed = await menuRepository.updateIngredientQuantity(productId, ingredientId, quantity);
  if (!changed) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.INGREDIENT_NOT_LINKED);
  return get(productId);
}

// The file is saved only after the product is known to exist; the replaced file is deleted afterwards.
async function setImage(id, buffer, type) {
  if (!(await menuRepository.findById(id))) throw notFound();
  const filename = await imageService.saveProductImage(buffer, type);
  const previous = await menuRepository.setImagePath(id, filename);
  if (previous === undefined) { // product deleted while the file was being written
    await imageService.removeProductImage(filename);
    throw notFound();
  }
  await imageService.removeProductImage(previous);
  return get(id);
}

module.exports = { list, summary, get, create, update, remove, updateIngredientQuantity, setImage };
