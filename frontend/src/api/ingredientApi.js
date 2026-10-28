// Ingredients (Menu Service): a shared list of names; the quantity belongs to the product that uses it.
import { request } from './client.js';

export const searchIngredients = (search, signal) => request('GET', '/ingredients', { query: { search }, signal }); // -> [{ id, code, name }]
export const createIngredient = (name) => request('POST', '/ingredients', { json: { name } });
