import Dropdown from '../common/Dropdown.jsx';

// "Category" dropdown in the header of the discount product table.
export default function ProductFilter({ value, categories, onChange }) {
  const options = [{ value: '', label: 'Category' }, ...categories.map((c) => ({ value: c, label: c }))];
  return <Dropdown className="dropdown--head" triangle value={value} options={options} placeholder="Category" onChange={onChange} />;
}
