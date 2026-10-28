import { useState } from 'react';
import NextButton from '../../components/buttons/NextButton.jsx';
import PreviousButton from '../../components/buttons/PreviousButton.jsx';
import { OtpEntry } from '../../components/common/OtpInput.jsx';
import { SignupLayout } from '../../stepper/SignupStepper.jsx';
import { validateOtp } from '../../validation/authValidation.js';

// Step 4: Phone number verification. onNext(code) checks the code with the Auth Service ({ ok, error? }); onResend() asks for a new one.
export default function Signup2({ onNext, onPrevious, onResend, notice }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = async () => {
    if (busy) return;
    const found = validateOtp(code);
    setError(found);
    if (found) return;
    setBusy(true);
    const result = await onNext(code);
    if (!result.ok) { setBusy(false); setError(result.error); }
  };

  return (
    <SignupLayout current={4} title="Phone Number Verification">
      <div className="signup-card signup-card--otp">
        <p className="signup-note">Verification code is sent to the registered Phone number for authentication</p>
        {notice && <p className="auth-error auth-error--small" role="status">{notice}</p>}
        <span className="signup-label">Phone number verification code</span>
        <OtpEntry code={code} onChange={(next2) => { setCode(next2); setError(''); }} error={error} onResend={onResend} />
        <div className="signup-actions">
          <PreviousButton onClick={onPrevious} />
          <NextButton onClick={next} label={busy ? 'Verifying...' : 'Next'} />
        </div>
      </div>
    </SignupLayout>
  );
}
