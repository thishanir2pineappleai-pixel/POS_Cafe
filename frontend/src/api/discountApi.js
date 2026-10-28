// Discount DEFINITIONS (Menu Service): a name and a percentage. Applying one to products is in salesApi.js.
import { request } from './client.js';

export const listDiscounts = (signal) => request('GET', '/discounts', { signal }); // -> [{ id, name, percentage }]
export const createDiscount = ({ name, percentage }) => request('POST', '/discounts', { json: { name, percentage } });
