const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

// Today / Week / Month switch of the Sales Trend card.
export default function SalesTrendFilter({ value, onChange }) {
  return (
    <div className="seg" role="group" aria-label="Sales trend period">
      {PERIODS.map(({ id, label }) => (
        <button type="button" key={id} className={`seg__btn${value === id ? ' is-active' : ''}`} aria-pressed={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
