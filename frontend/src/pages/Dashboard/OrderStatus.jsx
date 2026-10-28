import { BagCheckIcon, ChefHatIcon, ClockIcon, CheckCircleIcon, XCircleIcon } from '../../components/common/Icons.jsx';

const ICONS = { pending: ClockIcon, preparing: ChefHatIcon, delivered: CheckCircleIcon, paid: BagCheckIcon, cancelled: XCircleIcon };

// Order-status strip: five counts, each with its own colour.
export default function OrderStatus({ statuses }) {
  return (
    <section className="dash-card dash-status">
      <h2>Order<br />Status</h2>
      <div className="dash-status__cards">
        {statuses.map(({ id, label, count, tone }) => {
          const Icon = ICONS[id];
          return (
            <article className={`dash-status__card dash-status__card--${tone}`} key={id}>
              <span className="dash-status__icon"><Icon size={20} /></span>
              <span className="dash-status__text"><small>{label}</small><strong>{count}</strong></span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
