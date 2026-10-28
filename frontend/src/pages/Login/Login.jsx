import { useState } from 'react';
import LoginButton from '../../components/buttons/LoginButton.jsx';
import PasswordInput from '../../components/common/PasswordInput.jsx';
import { AlertCircleIcon } from '../../components/common/Icons.jsx';
import AuthLayout from '../../layout/AuthLayout.jsx';
import { validateEmail, validateRequired } from '../../validation/authValidation.js';

// Checks that both fields are filled and the email looks like an email, then asks the server (onSubmit resolves to
// { ok: true } or { ok: false, error }). A refused sign-in shows the reason under the password field and nothing else changes.
export default function Login({ onSubmit, onForgotPassword, onSignup, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const edit = (setter) => (e) => { setter(e.target.value); setErrors({}); };
  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const found = { email: validateEmail(email), password: validateRequired(password, 'Enter your password.') };
    if (found.email || found.password) { setErrors(found); return; }
    setSubmitting(true);
    const result = await onSubmit({ email, password, keepSignedIn });
    // On success this screen is replaced, so it only has to react to a refusal.
    if (!result?.ok) { setSubmitting(false); setErrors({ password: result?.error ?? 'Could not sign in. Please try again.' }); }
  };
  const failed = Boolean(errors.email || errors.password);

  return (
    <AuthLayout title={<>Welcome to the PAI POS<br />Owner's Dashboard</>} subtitle="Sign in to unlock your experience">
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="auth-field">
          <span className="auth-label">Email</span>
          <input className={`input${errors.email ? ' has-error' : email ? ' is-filled' : ''}`} type="email" value={email}
            placeholder="Enter your email" onChange={edit(setEmail)} autoComplete="off" />
          {errors.email && <span className="auth-error"><AlertCircleIcon size={12} />{errors.email}</span>}
        </label>
        <div className="auth-field">
          <span className="auth-label">Password</span>
          <PasswordInput className={password && !errors.password ? 'is-filled' : ''} invalid={Boolean(errors.password)} value={password}
            placeholder="Enter your password" onChange={edit(setPassword)} />
          {errors.password && <span className="auth-error"><AlertCircleIcon size={12} />{errors.password}</span>}
        </div>
        {notice && <p className="signup-note" role="status">{notice}</p>}
        <div className="auth-row">
          <label className="check"><input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} />Keep me signed in</label>
          <button type="button" className="link-btn link-btn--bold" onClick={onForgotPassword}>Forgot Password</button>
        </div>
        <LoginButton type="submit" label={submitting ? 'Signing in...' : 'Login'} disabled={failed || submitting} />
        <p className="auth-foot">Don't have an account? <button type="button" className="link-btn link-btn--bold" onClick={onSignup}>Sign up</button></p>
      </form>
    </AuthLayout>
  );
}
