import { ArrowUpRightIcon, BagIcon, CashIcon, ClockIcon, UserPlusIcon } from '../../components/common/Icons.jsx';

const ICONS = { sales: CashIcon, orders: BagIcon, customers: UserPlusIcon, peak: ClockIcon };

// The four summary cards. A card without `change` has nothing to compare with yesterday and shows no comparison line.
export default function StatCards({ cards }) {
  return (
    <section className="dash-stats">
      {cards.map(({ id, label, value, change, tone }) => {
        const Icon = ICONS[id];
        return (
          <article className="dash-stat" key={id}>
            <span className={`dash-stat__icon dash-stat__icon--${tone}`}><Icon size={22} /></span>
            <div className="dash-stat__text">
              <span className="dash-stat__label">{label}</span>
              <strong className="dash-stat__value">{value}</strong>
            </div>
            {change !== undefined && <p className="dash-stat__change"><span><ArrowUpRightIcon size={11} />{change}</span> Vs Yesterday</p>}
          </article>
        );
      })}
    </section>
  );
}
