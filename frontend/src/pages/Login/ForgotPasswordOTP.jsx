import { useState } from 'react';
import VerifyOTPButton from '../../components/buttons/VerifyOTPButton.jsx';
import { OtpEntry } from '../../components/common/OtpInput.jsx';
import AuthLayout from '../../layout/AuthLayout.jsx';
import { validateOtp } from '../../validation/authValidation.js';

// Checks the reset code with the Auth Service (onVerified(code) resolves to { ok, error? }); onResend() asks for a new one.
// `notice` is shown when the server could not send the message. The copy says "for <email>" rather than "we've sent to":
// the server answers the same way whether or not the account exists.
export default function ForgotPasswordOTP({ email, onVerified, onResend, onBackToLogin, notice }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (busy) return;
    const found = validateOtp(code);
    setError(found);
    if (found) return;
    setBusy(true);
    const result = await onVerified(code);
    if (!result.ok) { setBusy(false); setError(result.error); }
  };

  return (
    <AuthLayout title="Code Verification"
      subtitle={<>Enter the verification code for<br /><strong className="auth-email">{email}</strong></>}>
      <div className="auth-form auth-form--otp">
        {notice && <p className="auth-error" role="status">{notice}</p>}
        <OtpEntry code={code} onChange={(next) => { setCode(next); setError(''); }} error={error} centered onResend={onResend} />
        <VerifyOTPButton label={busy ? 'Verifying...' : 'Verify Email'} onClick={verify} />
        <button type="button" className="auth-back" onClick={onBackToLogin}>Back to Login</button>
      </div>
    </AuthLayout>
  );
}
