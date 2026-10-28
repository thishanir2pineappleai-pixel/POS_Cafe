import Dropdown from '../common/Dropdown.jsx';

export default function CategoryFilter({ value, categories, onChange }) {
  const options = [{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))];
  return (
    <div className="field">
      <span className="field-label">Category</span>
      <Dropdown value={value} options={options} placeholder="All Categories" onChange={onChange} />
    </div>
  );
}
