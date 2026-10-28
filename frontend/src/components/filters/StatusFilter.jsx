import Dropdown from '../common/Dropdown.jsx';

const OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'In Stock', label: 'In stock' },
  { value: 'Low Stock', label: 'Low Stock' },
  { value: 'Out of stock', label: 'Out of Stock' },
];

export default function StatusFilter({ value, onChange }) {
  return (
    <div className="field">
      <span className="field-label">Status</span>
      <Dropdown value={value} options={OPTIONS} placeholder="All Status" onChange={onChange} />
    </div>
  );
}
