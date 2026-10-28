import { TrashIcon } from '../common/Icons.jsx';

// Red trash icon button used in the product table action column.
export default function DeleteButton({ onClick, label = 'Delete' }) {
  return (
    <button type="button" className="icon-btn icon-btn--red" onClick={onClick} aria-label={label} title={label}>
      <TrashIcon size={15} />
    </button>
  );
}
