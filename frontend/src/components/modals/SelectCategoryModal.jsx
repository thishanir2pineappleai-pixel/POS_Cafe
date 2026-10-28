import { ModalHeader, ModalShell } from './ConfirmationModal.jsx';

export default function SelectCategoryModal({ categories, selected, onSelect, onClose }) {
  return (
    <ModalShell className="modal--list" onClose={onClose}>
      <ModalHeader title="Select category" onClose={onClose} />
      <ul className="modal__list">
        {categories.map((name) => (
          <li key={name}>
            <button type="button" className={name === selected ? 'is-selected' : ''} onClick={() => onSelect(name)}>{name}</button>
          </li>
        ))}
      </ul>
    </ModalShell>
  );
}
