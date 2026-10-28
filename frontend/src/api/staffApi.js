// Staff, roles, teams and shifts (Staff Service, through the Gateway). Salary, EPF/ETF and document information are sent only to
// the owner. The staff picture and documents are private: they are fetched with the signed-in token (download), not by URL.
import { download, request, requestPage } from './client.js';

// query: { q, roleId, teamId, shiftId, status: active|inactive, page, limit } -> { data: [staff], meta }
export const listStaff = (query, signal) => requestPage('GET', '/staff', { query, signal });
// -> { totalStaff, activeStaff, inactiveStaff, staffOnDuty, activeShift: { name, ... } | null }
export const staffSummary = (signal) => request('GET', '/staff/summary', { signal });
export const getStaff = (id, signal) => request('GET', `/staff/${id}`, { signal });
export const createStaff = (body) => request('POST', '/staff', { json: body });
export const updateStaff = (id, body) => request('PATCH', `/staff/${id}`, { json: body }); // only the fields sent change
export const setStaffStatus = (id, { active, inactiveReason }) => request('PUT', `/staff/${id}/status`, { json: { active, inactiveReason } });
export const deleteStaff = (id) => request('DELETE', `/staff/${id}`); // reversible: the record is kept
export const restoreStaff = (id) => request('POST', `/staff/${id}/restore`);

export function uploadStaffImage(id, file) {
  const form = new FormData();
  form.append('image', file);
  return request('POST', `/staff/${id}/image`, { form });
}
// slot: cv | idCopy | agreement. Owner only.
export function uploadStaffDocument(id, slot, file) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', `/staff/${id}/documents/${slot}`, { form });
}
export const staffImage = (id) => download(`/staff/${id}/image`); // -> { blob }
export const staffDocument = (id, slot) => download(`/staff/${id}/documents/${slot}`); // -> { blob, filename }

export const listRoles = (signal) => request('GET', '/roles', { signal }); // -> [{ id, name, staffCount, permissions }]
export const createRole = (name) => request('POST', '/roles', { json: { name } });
export const listTeams = (signal) => request('GET', '/teams', { signal }); // -> [{ id, name, staffCount }]
export const createTeam = (name) => request('POST', '/teams', { json: { name } });
export const listShifts = (signal) => request('GET', '/shifts', { signal }); // -> [{ id, name, startTime, endTime, active }]
export const createShift = ({ name, startTime, endTime }) => request('POST', '/shifts', { json: { name, startTime, endTime } });
