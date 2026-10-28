// Orders (Sales Service, through the Gateway). Totals and prices are calculated by the server; only product ids and
// quantities are sent.
import { download, request, requestPage } from './client.js';

// query: { from, to, search, shopId, page, limit } -> { data: [order], meta }
export const listOrders = (query, signal) => requestPage('GET', '/orders', { query, signal });
export const getOrder = (id, signal) => request('GET', `/orders/${id}`, { signal });
// body: { type: 'Take Away' | 'Dine-In', customerName?, tableLabel?, shopId?, items: [{ productId, quantity }] }
export const createOrder = (body) => request('POST', '/orders', { json: body });
export const updateOrder = (id, body) => request('PUT', `/orders/${id}`, { json: body });
export const setOrderStatus = (id, status) => request('PATCH', `/orders/${id}/status`, { json: { status } });
export const payOrder = (id, method) => request('POST', `/orders/${id}/payments`, { json: { method } });
// Same filters as listOrders (without paging) -> { blob, filename }
export const exportOrders = (query) => download('/orders/export', { query: { ...query, format: 'csv' } });
