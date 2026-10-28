import { useState } from 'react';
import ContinueButton from '../../components/buttons/ContinueButton.jsx';
import { AlertCircleIcon } from '../../components/common/Icons.jsx';
import AuthLayout from '../../layout/AuthLayout.jsx';
import { validateEmail } from '../../validation/authValidation.js';

// Asks the Auth Service to send a reset code (onContinue resolves to { ok, error? }). The server answers the same way for an
// unknown email, so this screen never reveals whether an account exists.
export default function ForgotPassword({ email: initialEmail = '', onContinue, onBackToLogin }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = validateEmail(email);
    setError(found);
    if (found) return;
    setBusy(true);
    const result = await onContinue(email.trim());
    if (!result.ok) { setBusy(false); setError(result.error); }
  };

  return (
    <AuthLayout title="Forgot your password" subtitle="Please enter your email to reset your password" narrow>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="auth-field">
          <input className={`input${error ? ' has-error' : ''}`} type="email" value={email} placeholder="Enter your email"
            onChange={(e) => { setEmail(e.target.value); setError(''); }} autoComplete="off" aria-label="Email" />
          {error && <span className="auth-error"><AlertCircleIcon size={12} />{error}</span>}
        </label>
        <ContinueButton type="submit" label={busy ? 'Please wait...' : 'Continue'} />
        <button type="button" className="auth-back" onClick={onBackToLogin}>Back to Login</button>
      </form>
    </AuthLayout>
  );
}
