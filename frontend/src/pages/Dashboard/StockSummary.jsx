import { ClockIcon } from '../../components/common/Icons.jsx';

const BADGE = { 'Out of Stock': 'out', 'Low Stock': 'low' };

// "View All" has no destination in the design, so it does nothing yet.
export default function StockSummary({ counts, items }) {
  return (
    <section className="dash-card dash-stock">
      <div className="dash-card__head">
        <h2>Stock Details</h2>
        <button type="button" className="link-btn link-btn--bold">View All</button>
      </div>
      <div className="dash-stock__counts">
        {counts.map(({ id, label, count, tone }) => (
          <div className={`dash-stock__count dash-stock__count--${tone}`} key={id}>
            <span className="dash-stock__count-icon"><ClockIcon size={14} /></span>
            <span><small>{label}</small><strong>{count}</strong></span>
          </div>
        ))}
      </div>
      <ul className="dash-stock__list">
        {items.map((item) => (
          <li key={item.id}>
            <img src={item.image} alt="" />
            <span className="dash-stock__name"><strong>{item.name}</strong><small>{item.category}</small></span>
            <span className="dash-stock__qty">
              <strong className={`dash-stock__amount dash-stock__amount--${BADGE[item.status]}`}>{item.quantity}</strong>
              <span className={`badge badge--${BADGE[item.status]}`}>{item.status}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
