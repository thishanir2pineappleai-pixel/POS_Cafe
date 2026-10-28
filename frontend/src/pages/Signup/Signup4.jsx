import { useState } from 'react';
import VerifyEmailButton from '../../components/buttons/VerifyEmailButton.jsx';
import { OtpEntry } from '../../components/common/OtpInput.jsx';
import { SignupLayout } from '../../stepper/SignupStepper.jsx';
import { validateOtp } from '../../validation/authValidation.js';

// Step 2: Email verification. onNext(code) checks the code with the Auth Service ({ ok, error? }); onResend() asks for a new one.
// `notice` is shown when the server could not send the message.
export default function Signup4({ onNext, onResend, notice }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (busy) return;
    const found = validateOtp(code);
    setError(found);
    if (found) return;
    setBusy(true);
    const result = await onNext(code);
    if (!result.ok) { setBusy(false); setError(result.error); }
  };

  return (
    <SignupLayout current={2} title="Email verification">
      <div className="signup-card signup-card--otp">
        <p className="signup-note">Verification code is sent to the registered email for authentication</p>
        {notice && <p className="auth-error auth-error--small" role="status">{notice}</p>}
        <span className="signup-label">Email verification code</span>
        <OtpEntry code={code} onChange={(next) => { setCode(next); setError(''); }} error={error} onResend={onResend} />
        <VerifyEmailButton label={busy ? 'Verifying...' : 'Verify email'} onClick={verify} />
      </div>
    </SignupLayout>
  );
}
