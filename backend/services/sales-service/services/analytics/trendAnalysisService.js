// Sales Trend chart data: revenue per bucket for Today, Week or Month. Only real orders count; a bucket with no
// orders is 0. Revenue excludes Cancelled orders (same rule as the other sales numbers).
//   today: 7 buckets as drawn (06:00, 09:00, 12:00, 15:00, 18:00, 21:00 and 12:00 AM). PENDING: each covers three hours from
//          its start, the last bucket "12:00 AM" covers 00:00-05:59, and the first starts at 06:00.
//   week : Monday to Sunday of the week that contains the date.
//   month: January to December of the year that contains the date. PENDING: the design only shows January-July.
const { orderRepository } = require('../../repositories');
const { addDays, dateOf, hourOf, weekStart } = require('@pos-cafe/shared/date');
const { toCents, fromCents } = require('../../utils/money');
const { revenueOf, NO_SHOP } = require('./salesAnalyticsService');

const DAY_BUCKETS = [
  { hour: 6, label: '06:00 AM' }, { hour: 9, label: '09:00 AM' }, { hour: 12, label: '12:00 PM' }, { hour: 15, label: '15:00 PM' },
  { hour: 18, label: '18:00 PM' }, { hour: 21, label: '21:00 PM' }, { hour: 0, label: '12:00 AM' },
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const bucketHour = (hour) => (hour < 6 ? 0 : Math.floor(hour / 3) * 3);

async function salesTrend(auth, { shopId, period, date }) {
  const scope = { accountId: auth.accountId, shopId };
  let points;
  if (period === 'week') {
    const from = weekStart(date);
    const orders = await orderRepository.findAll({ ...scope, from, to: addDays(from, 6) });
    points = WEEKDAYS.map((label, i) => ({ label, value: revenueOf(orders.filter((o) => dateOf(o.placedAt) === addDays(from, i))) }));
  } else if (period === 'month') {
    const year = date.slice(0, 4);
    const orders = await orderRepository.findAll({ ...scope, from: `${year}-01-01`, to: `${year}-12-31` });
    points = MONTHS.map((label, i) => ({ label, value: revenueOf(orders.filter((o) => Number(dateOf(o.placedAt).slice(5, 7)) === i + 1)) }));
  } else {
    const orders = await orderRepository.findAll({ ...scope, from: date, to: date });
    points = DAY_BUCKETS.map(({ hour, label }) => ({ label, value: revenueOf(orders.filter((o) => bucketHour(hourOf(o.placedAt)) === hour)) }));
  }
  const total = fromCents(points.reduce((sum, p) => sum + toCents(p.value), 0));
  return { period, date, shopId: shopId === NO_SHOP ? null : shopId, points, total };
}

module.exports = { salesTrend };
