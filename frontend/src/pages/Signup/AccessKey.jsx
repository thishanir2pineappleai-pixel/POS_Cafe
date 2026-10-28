import { useState } from 'react';
import NextButton from '../../components/buttons/NextButton.jsx';
import { ChevronLeftIcon } from '../../components/common/Icons.jsx';
import illustration from '../../assets/images/access-key-illustration.png';
import { validateRequired } from '../../validation/authValidation.js';

// Access-key activation. onNext(key) activates the account with the Auth Service ({ ok, error? }); onResend() asks for a new key.
export default function AccessKey({ onBack, onNext, onResend }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = validateRequired(key, 'Enter your access key.');
    setError(found);
    if (found) return;
    setBusy(true);
    const result = await onNext(key.trim());
    if (!result.ok) { setBusy(false); setError(result.fields?.accessKey ?? result.error); }
  };
  const resend = async () => {
    setInfo('');
    const result = await onResend();
    if (result.ok) setInfo('If the email is registered, a new access key has been requested.');
    else setError(result.error);
  };

  return (
    <div className="access-page">
      <form className="access" onSubmit={submit} noValidate>
        <button type="button" className="info-page__back access__back" onClick={onBack} aria-label="Back"><ChevronLeftIcon size={16} /></button>
        <img className="access__art" src={illustration} alt="" />
        <p className="access__text">Check your email for the access key and enter it to activate your account.</p>
        <label className="signup-field">
          <span className="signup-label">Access key</span>
          <input className={`input${error ? ' has-error' : ''}`} value={key} placeholder="Enter your access key" autoComplete="off"
            onChange={(e) => { setKey(e.target.value); setError(''); setInfo(''); }} />
          {error && <span className="auth-error auth-error--small" role="alert">{error}</span>}
          {info && <span className="signup-note" role="status">{info}</span>}
        </label>
        <NextButton type="submit" block dark label={busy ? 'Activating...' : 'Next'} />
        <button type="button" className="link-btn link-btn--bold" onClick={resend}>Send the access key again</button>
      </form>
    </div>
  );
}
