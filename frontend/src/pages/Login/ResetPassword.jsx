import { useState } from 'react';
import ResetpasswordButton from '../../components/buttons/ResetpasswordButton.jsx';
import PasswordInput from '../../components/common/PasswordInput.jsx';
import AuthLayout from '../../layout/AuthLayout.jsx';
import { passwordStrength, validateConfirm, validateNewPassword } from '../../validation/authValidation.js';

const STRENGTH_TEXT = { weak: 'Your password could be stronger', strong: 'Your password is strong' };

// Validates the rule from the Figma (8 characters with upper and lower case, numbers and symbols, no spaces) and that both
// fields match, then onReset(password, confirm) saves it with the Auth Service ({ ok, error?, fields? }).
export default function ResetPassword({ onReset, onBackToLogin }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false); // the rule message appears after leaving the field or submitting
  const [confirmError, setConfirmError] = useState('');
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);
  const ruleError = touched ? validateNewPassword(password) : '';

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setTouched(true);
    const mismatch = validateConfirm(password, confirm);
    setConfirmError(mismatch);
    if (validateNewPassword(password) || mismatch) return;
    setBusy(true);
    const result = await onReset(password, confirm);
    if (!result.ok) { setBusy(false); setServerError(result.fields?.password ?? result.error); }
  };

  return (
    <AuthLayout title="Set your new password" subtitle={<>Create a new password. Make sure it's different from<br />your previous password</>} narrow>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="auth-field">
          <PasswordInput invalid={Boolean(ruleError) && strength === 'none'} value={password} placeholder="Enter your password" aria-label="New password"
            onChange={(e) => { setPassword(e.target.value); setConfirmError(''); setServerError(''); }} onBlur={() => setTouched(true)} />
          {strength !== 'none' && (
            <>
              <span className={`strength strength--${strength}`} />
              <span className={`strength-text strength-text--${strength}`}>{STRENGTH_TEXT[strength]}</span>
            </>
          )}
          {ruleError && strength === 'none' && <span className="auth-error auth-error--small">{ruleError}</span>}
        </div>
        <div className="auth-field">
          <PasswordInput invalid={Boolean(confirmError)} value={confirm} placeholder="Re-Enter your password" aria-label="Confirm password"
            onChange={(e) => { setConfirm(e.target.value); setConfirmError(''); setServerError(''); }} />
          {confirmError && <span className="auth-error auth-error--small">{confirmError}</span>}
        </div>
        {serverError && <span className="auth-error auth-error--small" role="alert">{serverError}</span>}
        <ResetpasswordButton type="submit" label={busy ? 'Please wait...' : 'Reset password'} />
        <button type="button" className="auth-back" onClick={onBackToLogin}>Back to login</button>
      </form>
    </AuthLayout>
  );
}
