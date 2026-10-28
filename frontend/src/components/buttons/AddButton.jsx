import { PlusIcon } from '../common/Icons.jsx';

export default function AddButton({ label = 'Add', onClick, className = '' }) {
  return (
    <button type="button" className={`btn btn-primary ${className}`} onClick={onClick}>
      <PlusIcon size={18} />
      {label}
    </button>
  );
}
