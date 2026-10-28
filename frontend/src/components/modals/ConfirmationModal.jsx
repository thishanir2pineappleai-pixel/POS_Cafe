import CancelButton from '../buttons/CancelButton.jsx';
import SaveButton from '../buttons/SaveButton.jsx';
import { CloseIcon } from '../common/Icons.jsx';

// Shared overlay + dialog box used by every modal in this module.
export function ModalShell({ className = '', onClose, children }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

export function ModalHeader({ title, onClose }) {
  return (
    <div className="modal__header">
      <h2>{title}</h2>
      <button type="button" className="modal__close" onClick={onClose} aria-label="Close"><CloseIcon size={12} /></button>
    </div>
  );
}

// "Click Save to ..." style confirmation. `children` renders extra content under the message.
export default function ConfirmationModal({ message, children, confirmLabel, onConfirm, onCancel, className = '' }) {
  return (
    <ModalShell className={`modal--confirm ${className}`}>
      <p className="modal__message">{message}</p>
      {children}
      <div className="modal__actions">
        <CancelButton onClick={onCancel} />
        <SaveButton label={confirmLabel} onClick={onConfirm} />
      </div>
    </ModalShell>
  );
}
