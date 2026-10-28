import { CloseIcon } from '../common/Icons.jsx';

export default function ClearAllButton({ onClick }) {
  return (
    <button type="button" className="btn btn-clear" onClick={onClick}>
      <CloseIcon size={14} />
      Clear All
    </button>
  );
}
