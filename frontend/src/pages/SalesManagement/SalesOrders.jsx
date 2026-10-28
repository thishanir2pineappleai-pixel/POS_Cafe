import ExportSalesDataButton from '../../components/buttons/ExportSalesDataButton.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import SearchInput from '../../components/common/SearchInput.jsx';
import { formatRs } from '../../api/formatCurrency.js';
import { formatLong, fromISO } from '../../api/formatDate.js';

const COLUMNS = ['Order ID', 'Order Type', 'Customer', 'Items', 'Total', 'Status', 'Time', 'Date'];
const COLS = '1fr .9fr 1.1fr 2.2fr .9fr 1fr .9fr 1fr';

export default function SalesOrders({ orders, query, onQuery, onExport }) {
  return (
    <section className="panel orders">
      <div className="orders__top">
        <h2>Order Details</h2>
        <SearchInput value={query} onChange={onQuery} placeholder="Search Orders" />
        <ExportSalesDataButton onExport={onExport} />
      </div>

      <div className="gtable" style={{ '--cols': COLS }}>
        <div className="gtable__inner">
          <div className="gtable__row gtable__head">
            {COLUMNS.map((c) => <span key={c}>{c}</span>)}
          </div>
          {orders.length === 0 && <EmptyState message="No orders found" />}
          {orders.map((o, i) => (
            <div className="gtable__row" key={`${o.id}-${i}`}>
              <span className="b">{o.id}</span>
              <span className="b">{o.type}</span>
              <span>{o.customer}</span>
              <span>{o.items}</span>
              <span className="b">{formatRs(o.total)}</span>
              <span><span className={`badge badge--${o.status.toLowerCase()}`}>{o.status}</span></span>
              <span className="m">{o.time}</span>
              <span className="m">{formatLong(fromISO(o.date))}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
