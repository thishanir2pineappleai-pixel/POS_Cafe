// "View All" has no destination in the design, so it does nothing yet.
export default function TopSellingItems({ items }) {
  return (
    <section className="dash-card dash-top">
      <div className="dash-card__head">
        <h2>Top Selling Items</h2>
        <button type="button" className="link-btn link-btn--bold">View All</button>
      </div>
      {items.length === 0 && <div className="empty-state">No sales yet today</div>}
      <ul className="dash-top__list">
        {items.map((item) => (
          <li key={item.id}>
            <img src={item.image} alt="" />
            <span className="dash-top__name"><strong>{item.name}</strong><small>{item.category}</small></span>
            <span className="dash-top__sold"><strong>{item.sold} Sold</strong><small>{item.price}</small></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
