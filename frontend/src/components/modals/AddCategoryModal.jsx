import { useState } from 'react';
import { ModalHeader, ModalShell } from './ConfirmationModal.jsx';
import SaveButton from '../buttons/SaveButton.jsx';

// onSave(name) may return a promise of { ok, error? }: a refusal (for example a duplicate name) is shown inside the dialog.
export default function AddCategoryModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const result = await onSave(name.trim());
    setBusy(false);
    if (result && result.ok === false) setError(result.fields?.name ?? result.error);
  };

  return (
    <ModalShell className="modal--form" onClose={onClose}>
      <ModalHeader title="Add category" onClose={onClose} />
      <form className="modal__body" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Category</span>
          <input className={`input${error ? ' has-error' : ''}`} autoFocus value={name} placeholder="Drinks" onChange={(e) => { setName(e.target.value); setError(''); }} />
          {error && <span className="field-error" role="alert">{error}</span>}
        </label>
        <SaveButton type="submit" label={busy ? 'Saving...' : 'Save'} className="btn-block" />
      </form>
    </ModalShell>
  );
}
