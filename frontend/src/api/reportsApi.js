// Sales numbers for the Sales Management cards (Sales Service).
import { request } from './client.js';

// query: { from, to, shopId } -> { totalRevenue, totalOrders, newCustomers, peakHour: { label } | null }
export const salesSummary = (query, signal) => request('GET', '/reports/sales/summary', { query, signal });
