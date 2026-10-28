// Products (Menu Service). Prices are plain numbers; the picture is uploaded separately after the product exists.
import { request, requestPage } from './client.js';

// query: { search, status: in_stock|low_stock|out_of_stock, categoryId, sort: price_asc|price_desc, page, limit } -> { data, meta }
export const listProducts = (query, signal) => requestPage('GET', '/products', { query, signal });
// Every product, page after page (the server returns at most 100 per page): for pickers that list all products.
export async function listAllProducts(signal) {
  const all = [];
  for (let page = 1; page <= 100; page += 1) { // 100 pages x 100 = far more than a menu has
    const { data, meta } = await listProducts({ page, limit: 100 }, signal);
    all.push(...data);
    if (page >= meta.totalPages) break;
  }
  return all;
}
export const productSummary =(signal) => request('GET', '/products/summary', { signal }); // -> { total, active, outOfStock, categories }
export const getProduct = (id, signal) => request('GET', `/products/${id}`, { signal });
// body: { name, categoryId, costPrice?, sellingPrice, quantity, lowStockAlert?, discountId?, ingredients: [{ name, quantity }] }
export const createProduct = (body) => request('POST', '/products', { json: body });
export const updateProduct = (id, body) => request('PUT', `/products/${id}`, { json: body });
export const deleteProduct = (id) => request('DELETE', `/products/${id}`);
export const setIngredientQuantity = (id, ingredientId, quantity) => request('PATCH', `/products/${id}/ingredients/${ingredientId}`, { json: { quantity } });
export function uploadProductImage(id, file) {
  const form = new FormData();
  form.append('image', file); // the only field the server accepts
  return request('POST', `/products/${id}/image`, { form });
}
