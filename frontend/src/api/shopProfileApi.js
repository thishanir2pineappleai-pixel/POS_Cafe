// Shop profiles (Settings Service). The logo is uploaded separately, after the profile exists.
import { request } from './client.js';

export const listShops = (signal) => request('GET', '/settings/shops', { signal }); // -> [{ id, name, address, phone, email, website, timezone, image, status, updatedAt }]
export const getShop = (id, signal) => request('GET', `/settings/shops/${id}`, { signal });
// body: { name, address, phone, email?, website?, timezone } (timezone: one of settingsApi.listTimezones). Creating is for the owner only.
export const createShop = (body) => request('POST', '/settings/shops', { json: body });
export const updateShop = (id, body) => request('PUT', `/settings/shops/${id}`, { json: body });
export function uploadShopImage(id, file) {
  const form = new FormData();
  form.append('image', file); // the only field the server accepts
  return request('POST', `/settings/shops/${id}/image`, { form });
}
