import { TrashIcon } from '../common/Icons.jsx';

// Red trash button that removes an added ingredient row in the product form.
export default function RemoveButton({ onClick, label = 'Remove' }) {
  return (
    <button type="button" className="icon-btn icon-btn--red icon-btn--lg" onClick={onClick} aria-label={label} title={label}>
      <TrashIcon size={17} />
    </button>
  );
}
