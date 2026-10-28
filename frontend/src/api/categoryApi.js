// Product categories (Menu Service).
import { request } from './client.js';

export const listCategories = (signal) => request('GET', '/categories', { signal }); // -> [{ id, name }]
export const createCategory = (name) => request('POST', '/categories', { json: { name } });
