// Admin profiles = the login users of the account (Auth Service, under /settings/admins). The owner is in the list too.
import { request } from './client.js';

export const listAdmins = (signal) => request('GET', '/settings/admins', { signal }); // -> [{ id, firstName, lastName, phone, email, role, image }]
export const getAdmin = (id, signal) => request('GET', `/settings/admins/${id}`, { signal });
// body: { firstName, lastName, phone, email, password }. Creating is for the owner only; the server enforces the password rule.
export const createAdmin = (body) => request('POST', '/settings/admins', { json: body });
// body: { firstName, lastName, phone, email } (a password is refused here)
export const updateAdmin = (id, body) => request('PUT', `/settings/admins/${id}`, { json: body });
export const changeAdminPassword = (id, password) => request('PUT', `/settings/admins/${id}/password`, { json: { password } });
export function uploadAdminImage(id, file) {
  const form = new FormData();
  form.append('image', file); // the only field the server accepts
  return request('POST', `/settings/admins/${id}/image`, { form });
}
