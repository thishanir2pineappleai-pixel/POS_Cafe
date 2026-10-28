import { useEffect } from 'react';
import { CheckCircleIcon, CloseIcon } from '../common/Icons.jsx';

// Success toast shown at the top right. Auto-dismiss after 4s is an assumption; the design only shows the toast.
export default function SuccessModal({ title, message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="toast" role="status">
      <span className="toast__icon"><CheckCircleIcon size={18} /></span>
      <div className="toast__text">
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      <button type="button" className="toast__close" onClick={onClose} aria-label="Close"><CloseIcon size={10} /></button>
    </div>
  );
}
