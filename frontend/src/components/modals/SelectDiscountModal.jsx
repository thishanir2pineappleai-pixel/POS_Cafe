import { ModalHeader, ModalShell } from './ConfirmationModal.jsx';

export default function SelectDiscountModal({ discounts, selected, onSelect, onClose }) {
  return (
    <ModalShell className="modal--list" onClose={onClose}>
      <ModalHeader title="Select Discount" onClose={onClose} />
      <ul className="modal__list">
        {discounts.map((d) => (
          <li key={d.name}>
            <button type="button" className={d.name === selected ? 'is-selected' : ''} onClick={() => onSelect(d.name)}>{d.name}</button>
          </li>
        ))}
      </ul>
    </ModalShell>
  );
}
