import { ChevronDownIcon, ChevronUpIcon, FilterIcon } from '../common/Icons.jsx';

export default function FilterButton({ open, onClick }) {
  return (
    <button type="button" className={`btn btn-filter${open ? ' is-open' : ''}`} onClick={onClick} aria-expanded={open}>
      <FilterIcon size={16} />
      <span>Filter</span>
      {open ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
    </button>
  );
}
