// "View All" has no destination in the design, so it does nothing yet. The design shows no paging here.
export default function RecentOrders({ orders }) {
  return (
    <section className="dash-card dash-recent">
      <div className="dash-card__head">
        <h2>Recent Orders</h2>
        <button type="button" className="link-btn link-btn--bold">View All</button>
      </div>
      <div className="dash-recent__table">
        <div className="dash-recent__row dash-recent__head"><span>Order ID</span><span>Table ID</span><span>Status</span></div>
        {orders.length === 0 && <div className="empty-state">No orders yet</div>}
        {orders.map((o) => (
          <div className="dash-recent__row" key={o.id}>
            <strong>{o.id}</strong>
            <span>{o.table}</span>
            <span><span className={`badge badge--${o.status.toLowerCase()}`}>{o.status}</span></span>
          </div>
        ))}
      </div>
    </section>
  );
}
