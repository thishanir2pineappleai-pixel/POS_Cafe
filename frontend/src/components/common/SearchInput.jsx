import { SearchIcon } from './Icons.jsx';

export default function SearchInput({ value, onChange, placeholder = 'Search' }) {
  return (
    <label className="search-input">
      <SearchIcon size={16} />
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
