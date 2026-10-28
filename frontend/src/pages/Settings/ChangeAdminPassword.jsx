import { useState } from 'react';
import { EditSquareIcon, EyeIcon, EyeOffIcon } from '../../components/common/Icons.jsx';
import ConfirmationModal from '../../components/modals/ConfirmationModal.jsx';
import { validateNewPassword } from '../../validation/authValidation.js';

// Password row of the View Admin Profile screen: new-password input, Update button and confirmation.
// onDraftChange(true/false) tells the page whether a new password is being typed (the header changes to "Update Admin Password").
// onUpdate(password) saves it with the Auth Service and resolves to { ok, error? }.
export default function ChangeAdminPassword({ onDraftChange, onUpdate }) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const change = (next) => { setValue(next); setError(''); onDraftChange(next !== ''); };
  const request = () => {
    if (!value) return;
    const found = validateNewPassword(value);
    if (found) { setError(found); return; }
    setConfirming(true);
  };
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    const result = await onUpdate(value);
    setSaving(false);
    setConfirming(false);
    if (!result.ok) { setError(result.fields?.password ?? result.error); return; }
    setValue('');
    setVisible(false);
    onDraftChange(false);
  };

  return (
    <>
      <span className="input-suffix password-row__input">
        <input className={`input${error ? ' has-error' : ''}`} type={visible ? 'text' : 'password'} value={value} placeholder="Enter new password"
          onChange={(e) => change(e.target.value)} />
        {value && (
          <button type="button" className="eye-btn" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
          </button>
        )}
      </span>
      <button type="button" className="btn btn-outline-green password-row__update" onClick={request}>
        <EditSquareIcon size={15} />Update
      </button>
      {error && <span className="field-error" role="alert">{error}</span>}

      {confirming && (
        <ConfirmationModal message="Click 'Save Changes' to update your Password." confirmLabel={saving ? 'Saving...' : 'Save Changes'}
          onCancel={() => setConfirming(false)} onConfirm={confirm} />
      )}
    </>
  );
}
