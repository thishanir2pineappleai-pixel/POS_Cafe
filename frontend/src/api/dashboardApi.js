// Dashboard numbers (Sales Service, through the Gateway). Everything is limited to one shop of the signed-in account:
// `shopId` picks it, otherwise the account's first shop is used. `date` is YYYY-MM-DD (default: today on the server).
import { request } from './client.js';

const get = (name, query, signal) => request('GET', `/dashboard/${name}`, { query, signal });

export const summary = (query, signal) => get('summary', query, signal); // -> { sales, orders, newCustomers, peakHours } each { value, changePercent }
export const salesTrend = (query, signal) => get('sales-trend', query, signal); // query.period: today | week | month -> { points: [{ label, value }], total }
export const topSelling = (query, signal) => get('top-selling', query, signal); // -> { items: [{ productId, name, category, image, sold, price }] }
export const orderStatus = (query, signal) => get('order-status', query, signal); // -> { statuses: [{ status, count }] }
export const recentOrders = (query, signal) => get('recent-orders', query, signal); // -> { orders: [{ orderId, tableId, status, ... }] }
export const stock = (query, signal) => get('stock', query, signal); // -> { counts: { outOfStock, lowStock, inStock }, items }
