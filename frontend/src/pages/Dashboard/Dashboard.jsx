import * as dashboardApi from '../../api/dashboardApi.js';
import { formatRs } from '../../api/formatCurrency.js';
import { productImage } from '../../api/formatImage.js';
import * as shopApi from '../../api/shopProfileApi.js';
import ErrorState from '../../components/common/ErrorState.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import MainLayout from '../../layout/MainLayout.jsx';
import OrderStatus from './OrderStatus.jsx';
import RecentOrders from './RecentOrders.jsx';
import SalesChart from './SalesChart.jsx';
import StatCardsdash from './StatCardsdash.jsx';
import StockSummary from './StockSummary.jsx';
import TopSellingItems from './TopSellingItems.jsx';

// "+5.2%" / "-3%" / null when there is nothing to compare with (no orders yesterday).
const changeText = (percent) => (percent === null || percent === undefined ? '–' : `${percent > 0 ? '+' : ''}${percent}%`);

// Order of the strip as drawn in the design; the server returns every status, in its own order.
const STATUS_ORDER = [['Pending', 'purple'], ['Preparing', 'orange'], ['Delivered', 'blue'], ['Paid', 'green'], ['Cancelled', 'red']];
const pad2 = (n) => String(n).padStart(2, '0');
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '–');

// ponytail: there is no opening-hours rule, so "Open" means the shop profile is Active.
function ShiftInfo({ cashier, loginAt, shop }) {
  const open = shop?.status === 'Active';
  return (
    <p className="shift">
      <span>Cashier: <strong>{cashier}</strong></span>
      <span>Login: <strong>{timeOf(loginAt)}</strong></span>
      <span>Shop: <strong className={open ? 'shift__open' : 'shift__closed'}>{open ? 'Open' : 'Closed'}</strong></span>
    </p>
  );
}

// Every number on this page comes from the Sales Service (orders) and the Menu Service (stock), through the Gateway.
export default function Dashboard() {
  const { user, loginAt } = useAuth();
  const { data, loading, error, reload } = useResource(async (signal) => {
    const [summary, topSelling, orderStatus, stock, recent, shops] = await Promise.all([
      dashboardApi.summary({}, signal), dashboardApi.topSelling({ limit: 4 }, signal), dashboardApi.orderStatus({}, signal),
      dashboardApi.stock({ limit: 4 }, signal), dashboardApi.recentOrders({ limit: 5 }, signal), shopApi.listShops(signal),
    ]);
    return { summary, topSelling, orderStatus, stock, recent, shop: shops.find((s) => s.id === summary.shopId) ?? null };
  });

  const cards = data && [
    { id: 'sales', label: "Today's Total Sales", value: formatRs(data.summary.sales.value), change: changeText(data.summary.sales.changePercent), tone: 'green' },
    { id: 'orders', label: "Today's Orders", value: String(data.summary.orders.value), change: changeText(data.summary.orders.changePercent), tone: 'blue' },
    { id: 'customers', label: 'New Customers', value: String(data.summary.newCustomers.value), change: changeText(data.summary.newCustomers.changePercent), tone: 'purple' },
    { id: 'peak', label: 'Peak Hours', value: data.summary.peakHours?.label ?? '–', tone: 'orange' }, // no comparison is defined for this card
  ];
  const statuses = data && STATUS_ORDER.map(([status, tone]) => ({
    id: status.toLowerCase(), label: status, tone, count: data.orderStatus.statuses.find((s) => s.status === status)?.count ?? 0,
  }));
  const topItems = data?.topSelling.items.map((i) => ({ id: i.productId ?? i.name, name: i.name, category: i.category ?? '', sold: i.sold, price: i.price === null ? '' : formatRs(i.price), image: productImage(i.image) }));
  const stockCounts = data && [
    { id: 'out', label: 'Out of Stock', count: pad2(data.stock.counts.outOfStock), tone: 'red' },
    { id: 'low', label: 'Low Stock', count: pad2(data.stock.counts.lowStock), tone: 'orange' },
    { id: 'in', label: 'In Stock', count: pad2(data.stock.counts.inStock), tone: 'green' },
  ];
  const stockItems = data?.stock.items.map((i) => ({ id: i.id, name: i.name, category: i.category, quantity: String(i.quantity), status: i.status === 'Low Stock' ? 'Low Stock' : 'Out of Stock', image: productImage(null) }));
  const recent = data?.recent.orders.map((o) => ({ id: o.orderId, table: o.tableId ?? '–', status: o.status }));

  return (
    <MainLayout title="Dashboard" subtitle="Quick insights into your business performance." active="Dashboard"
      meta={<ShiftInfo cashier={user?.firstName ?? '–'} loginAt={loginAt} shop={data?.shop} />}>
      {loading && !data && <LoadingState message="Loading the dashboard..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <div className="dash">
          <StatCardsdash cards={cards} />
          <div className="dash-row">
            <SalesChart shopId={data.summary.shopId} />
            <TopSellingItems items={topItems} />
          </div>
          <OrderStatus statuses={statuses} />
          <div className="dash-row">
            <StockSummary counts={stockCounts} items={stockItems} />
            <RecentOrders orders={recent} />
          </div>
        </div>
      )}
    </MainLayout>
  );
}
