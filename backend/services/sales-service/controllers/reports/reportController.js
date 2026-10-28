// The Sales Management cards and the Dashboard over HTTP. Every route needs a signed-in user.
// Dashboard responses are limited to ONE shop of the caller's account (the requested `shopId` if it is theirs, otherwise their
// first shop) and come from real stored data. With no data the same structure comes back with zeros, empty lists and nulls.
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const clock = require('@pos-cafe/shared/clock');
const { localDate } = require('@pos-cafe/shared/date');
const sales = require('../../services/analytics/salesAnalyticsService');
const trend = require('../../services/analytics/trendAnalysisService');

const salesSummary = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await sales.summary(req.auth, req.valid.query) });
});

// Resolves the query into { shopId, date, period, limit }. `date` defaults to today in the server's local time.
async function scope(req, defaultLimit) {
  const { date, period, shopId, limit } = req.valid.query;
  return {
    shopId: await sales.resolveShopId(req.auth, shopId ?? undefined),
    date: date ?? localDate(clock.now()),
    period,
    limit: limit ?? defaultLimit,
  };
}

const dashboard = (handler, defaultLimit = 0) => asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await handler(req.auth, await scope(req, defaultLimit)) });
});

module.exports = {
  salesSummary,
  summary: dashboard(sales.dashboardSummary),
  salesTrend: dashboard(trend.salesTrend),
  topSelling: dashboard(sales.dashboardTopSelling, 4),
  orderStatus: dashboard(sales.dashboardOrderStatus),
  recentOrders: dashboard(sales.dashboardRecentOrders, 5),
  // Menu products' stock: not shop-scoped, so it does not resolve a shop (but the caller must still be signed in).
  stock: asyncHandler(async (req, res) => {
    sendSuccess(res, { data: await sales.dashboardStock(req.valid.query.limit ?? 4) });
  }),
};
