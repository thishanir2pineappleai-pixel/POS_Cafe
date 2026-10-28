import Dropdown from '../common/Dropdown.jsx';

// The design offers "High to low" / "Low to High", so this sorts by selling price rather than filtering a range.
const OPTIONS = [
  { value: '', label: 'All Prices' },
  { value: 'desc', label: 'High to low' },
  { value: 'asc', label: 'Low to High' },
];

export default function PriceRangeFilter({ value, onChange }) {
  return (
    <div className="field">
      <span className="field-label">Price Range</span>
      <Dropdown value={value} options={OPTIONS} placeholder="All Prices" onChange={onChange} />
    </div>
  );
}
