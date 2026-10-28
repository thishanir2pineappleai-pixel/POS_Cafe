// Sales numbers computed only from orders that really exist in the repository. With no orders every number is 0 (or null /
// empty) and nothing is invented. Two groups of functions, both limited to the caller's ACCOUNT:
//   * summary(): the four Sales Management cards (every shop of the account, or one when a shopId is given).
//   * dashboard*(): the Dashboard, ALWAYS limited to ONE shop of the account.
// Revenue is summed in whole cents (utils/money.js).
const { orderRepository } = require('../../repositories');
const { ORDER_STATUS } = require('../../config/constants/orders');
const { addDays, dateOf, hourLabel, hourOf, monthRange, timeLabel, weekStart } = require('@pos-cafe/shared/date');
const { formatItemsText } = require('../../utils/formatter');
const { toCents, fromCents } = require('../../utils/money');
const menuClient = require('../integration/menuClient');
const shopScope = require('../shopScope');

// PENDING APPROVAL: revenue excludes Cancelled orders; Total Order counts every order in range.
const revenueCents = (orders) => orders.filter((o) => o.status !== ORDER_STATUS.CANCELLED).reduce((sum, o) => sum + toCents(o.total), 0);
const revenueOf = (orders) => fromCents(revenueCents(orders));

// The clock hour with the most orders; ties go to the earlier hour.
function peakHour(orders) {
  const counts = new Map();
  for (const o of orders) counts.set(hourOf(o.placedAt), (counts.get(hourOf(o.placedAt)) || 0) + 1);
  let best = null;
  for (const [hour, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (best === null || count > best.orders) best = { startHour: hour, endHour: (hour + 1) % 24, orders: count };
  }
  return best && { ...best, label: `${hourLabel(best.startHour)} – ${hourLabel(best.endHour)}` };
}

// auth: { accountId }; filters: { from, to, shopId? } (a shopId was already checked by the caller).
async function summary(auth, { from, to, shopId }) {
  const scope = { accountId: auth.accountId, shopId: await shopScope.checkShop(auth, shopId) };
  const orders = await orderRepository.findAll({ ...scope, from, to, search: null });
  return {
    range: { from: from ?? null, to: to ?? null },
    totalRevenue: revenueOf(orders),
    totalOrders: orders.length,
    newCustomers: await orderRepository.countNewCustomers({ ...scope, from, to }), // needs customerId on orders; see repository
    peakHour: peakHour(orders),
  };
}

// ---------------- Dashboard ----------------
// A shop id nobody has: used when the account has no shop, so the queries match no orders instead of every order.
const NO_SHOP = -1;

// The shop to report on: the requested one if it belongs to the caller's account (404 otherwise), else the account's first
// shop, else NO_SHOP.
async function resolveShopId(auth, requested) {
  return (await shopScope.resolveShop(auth, requested)) ?? NO_SHOP;
}

const shopOut = (shopId) => (shopId === NO_SHOP ? null : shopId);
// Percentage change against the previous period, one decimal; null when there is nothing to compare with.
const changePercent = (current, previous) => (previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10);

// Today's cards with the change versus the day before ("+5.2% Vs Yesterday").
async function dashboardSummary(auth, { shopId, date }) {
  const yesterday = addDays(date, -1);
  const scope = { accountId: auth.accountId, shopId };
  const [today, before] = await Promise.all([
    orderRepository.findAll({ ...scope, from: date, to: date }),
    orderRepository.findAll({ ...scope, from: yesterday, to: yesterday }),
  ]);
  const newToday = await orderRepository.countNewCustomers({ ...scope, from: date, to: date });
  const newBefore = await orderRepository.countNewCustomers({ ...scope, from: yesterday, to: yesterday });
  const sales = revenueOf(today);
  return {
    date,
    shopId: shopOut(shopId),
    sales: { value: sales, changePercent: changePercent(sales, revenueOf(before)) },
    orders: { value: today.length, changePercent: changePercent(today.length, before.length) },
    newCustomers: { value: newToday, changePercent: changePercent(newToday, newBefore) },
    peakHours: peakHour(today), // null when there were no orders; the design's "+5.2%" on this card has no defined meaning
  };
}

// All five statuses are always present, so the strip never has a missing card.
async function dashboardOrderStatus(auth, { shopId, date }) {
  const orders = await orderRepository.findAll({ accountId: auth.accountId, shopId, from: date, to: date });
  return {
    date,
    shopId: shopOut(shopId),
    statuses: Object.values(ORDER_STATUS).map((status) => ({ status, count: orders.filter((o) => o.status === status).length })),
  };
}

// PENDING APPROVAL: the design has no period for this card, so it follows the same Today / Week / Month choice (default today).
function periodRange(period, date) {
  if (period === 'week') { const from = weekStart(date); return { from, to: addDays(from, 6) }; }
  if (period === 'month') return monthRange(date);
  return { from: date, to: date };
}

// Items sold, most first. Cancelled orders are ignored. An item is matched by productId when the order line has one, otherwise
// by name. Category, picture and price come from the Menu product when the Menu Service still has it (asked over its internal
// API); otherwise the copy kept on the order line is used.
async function dashboardTopSelling(auth, { shopId, period, date, limit }) {
  const orders = (await orderRepository.findAll({ accountId: auth.accountId, shopId, ...periodRange(period, date) })).filter((o) => o.status !== ORDER_STATUS.CANCELLED);
  const sold = new Map();
  for (const order of orders) {
    for (const item of order.items) {
      const key = item.productId ? `p${item.productId}` : `n${item.name.toLowerCase()}`;
      const entry = sold.get(key) ?? { productId: item.productId ?? null, name: item.name, sold: 0, unitPrice: item.unitPrice ?? null };
      entry.sold += item.quantity;
      sold.set(key, entry);
    }
  }
  const top = [...sold.values()].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name)).slice(0, limit);
  const productIds = top.map((t) => t.productId).filter((id) => id !== null);
  const products = new Map((productIds.length ? await menuClient.lookupProducts(productIds) : []).map((p) => [p.id, p]));
  return {
    period,
    date,
    shopId: shopOut(shopId),
    items: top.map((entry) => {
      const product = entry.productId ? products.get(entry.productId) : null;
      return {
        productId: entry.productId,
        name: product ? product.name : entry.name,
        category: product ? product.categoryName : null,
        image: product ? product.image : null,
        sold: entry.sold,
        price: product ? product.sellingPrice : entry.unitPrice,
      };
    }),
  };
}

async function dashboardRecentOrders(auth, { shopId, limit }) {
  const rows = await orderRepository.recent({ accountId: auth.accountId, shopId, limit });
  return {
    shopId: shopOut(shopId),
    orders: rows.map((o) => ({
      id: o.id,
      orderId: o.orderNumber,
      tableId: o.tableLabel ?? null, // dine-in orders only
      type: o.type,
      status: o.status,
      total: o.total,
      itemsText: formatItemsText(o.items),
      time: timeLabel(o.placedAt),
      date: dateOf(o.placedAt),
    })),
  };
}

// Stock Details card. LIMITS: the design lists INGREDIENTS with units that belong to an Inventory module that does not exist,
// and Menu products have neither a unit nor a shop. So this reports the Menu PRODUCTS' stock (the whole catalogue, shared by
// all shops) as the Menu Service answers over its internal API, and says so in its response (source: menu_products).
const dashboardStock = (limit) => menuClient.stockOverview(limit);

module.exports = {
  summary, peakHour, revenueOf, resolveShopId, NO_SHOP, dashboardSummary, dashboardOrderStatus, dashboardTopSelling, dashboardRecentOrders, dashboardStock,
};
