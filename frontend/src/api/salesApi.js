// Discount APPLICATIONS (Sales Service): a Menu discount definition applied over a period to all or selected products.
// The definitions themselves are in discountApi.js (Menu Service).
import { request, requestPage } from './client.js';

// query: { search, page, limit } -> { data: [application], meta }
export const listApplications = (query, signal) => requestPage('GET', '/discounts/applications', { query, signal });
// body: { discountId, startDate, endDate (YYYY-MM-DD), appliesToAll, productIds?, status? }
export const createApplication = (body) => request('POST', '/discounts/applications', { json: body });
export const updateApplication = (id, body) => request('PUT', `/discounts/applications/${id}`, { json: body });
export const setApplicationStatus = (id, status) => request('PATCH', `/discounts/applications/${id}/status`, { json: { status } });
export const deleteApplication = (id) => request('DELETE', `/discounts/applications/${id}`);
