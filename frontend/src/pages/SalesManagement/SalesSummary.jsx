import { formatLKR } from '../../utils/formatCurrency.js';

// Four summary cards for the selected date range (from the Sales Service). While the numbers load they show a dash.
export default function SalesSummary({ summary }) {
  const cards = [
    ['Total Revenue', summary ? formatLKR(summary.totalRevenue) : '–'],
    ['Total Order', summary ? summary.totalOrders : '–'],
    ['New Customers', summary ? summary.newCustomers : '–'],
    ['Peak Hour', summary ? (summary.peakHour?.label ?? '-') : '–'],
  ];
  return (
    <section className="panel sales-stats">

      {cards.map(([label, value]) => (
        <div className="sales-stat" key={label}>
          <div className="sales-stat__label">{label}</div>
          <div className="sales-stat__value">{value}</div>
        </div>
      ))}

    </section>
  );
}
