import { useState } from 'react';
import { ModalHeader, ModalShell } from './ConfirmationModal.jsx';
import SaveButton from '../buttons/SaveButton.jsx';

// onSave({ name, percentage }) may return a promise of { ok, error? }: a refusal is shown inside the dialog.
export default function AddDiscountModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pct = Number(percentage);
  const valid = name.trim() && percentage !== '' && pct >= 0 && pct <= 100;
  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const result = await onSave({ name: name.trim(), percentage: pct });
    setBusy(false);
    if (result && result.ok === false) setError(result.fields?.name ?? result.fields?.percentage ?? result.error);
  };

  return (
    <ModalShell className="modal--form" onClose={onClose}>
      <ModalHeader title="Add Discount Name" onClose={onClose} />
      <form className="modal__body" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Discount Name</span>
          <input className="input" autoFocus value={name} placeholder="Discount Type" onChange={(e) => { setName(e.target.value); setError(''); }} />
        </label>
        <label className="field">
          <span className="field-label">Discount Percentage</span>
          <span className="input-suffix">
            <input className="input" type="number" min="0" max="100" value={percentage}
              placeholder="Enter Discount percentage" onChange={(e) => { setPercentage(e.target.value); setError(''); }} />
            <span>%</span>
          </span>
        </label>
        {error && <span className="field-error" role="alert">{error}</span>}
        <SaveButton type="submit" label={busy ? 'Adding...' : 'Add'} className="btn-block" />
      </form>
    </ModalShell>
  );
}
