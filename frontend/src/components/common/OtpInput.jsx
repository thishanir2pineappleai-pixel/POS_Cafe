import { useCallback, useEffect, useRef, useState } from 'react';
import ResendOTPButton from '../buttons/ResendOTPButton.jsx';
import { OTP_LENGTH } from '../../validation/authValidation.js';

const START_SECONDS = 2 * 60 + 59; // "Code expires in: 02:59" as drawn in the Figma

// Counts down from 02:59 (the Figma's expiry) and restarts when a new code was requested.
function useCountdown(start = START_SECONDS) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);
  const restart = useCallback(() => setLeft(start), [start]);
  return [left, restart];
}

const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Six one-digit boxes. `value` is a string of up to six digits. Supports typing, backspace, arrow keys and paste.
export default function OtpInput({ value, onChange, invalid = false, label = 'Verification code' }) {
  const refs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');

  const setAt = (index, digit) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, OTP_LENGTH));
  };
  const focus = (index) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))]?.focus();

  const onInput = (index) => (e) => {
    const typed = e.target.value.replace(/\D/g, '');
    if (!typed) { setAt(index, ''); return; }
    const next = digits.slice();
    typed.split('').slice(0, OTP_LENGTH - index).forEach((d, k) => { next[index + k] = d; });
    onChange(next.join(''));
    focus(index + typed.length);
  };
  const onKeyDown = (index) => (e) => {
    if (e.key === 'Backspace' && !digits[index]) { e.preventDefault(); focus(index - 1); setAt(index - 1, ''); }
    if (e.key === 'ArrowLeft') focus(index - 1);
    if (e.key === 'ArrowRight') focus(index + 1);
  };
  const onPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focus(pasted.length);
  };

  return (
    <div className="otp" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} className={`otp__box${invalid ? ' has-error' : ''}`}
          inputMode="numeric" autoComplete="one-time-code" maxLength={OTP_LENGTH} value={d}
          aria-label={`Digit ${i + 1}`} onChange={onInput(i)} onKeyDown={onKeyDown(i)} onPaste={onPaste} />
      ))}
    </div>
  );
}

// Boxes + "Code expires in" + "Resend". `onChange('')` clears the boxes when a new code is requested. `onResend` (optional)
// asks the server for a new code and resolves to { ok, error? }; the timer only restarts when the server accepted it.
export function OtpEntry({ code, onChange, error, centered = false, onResend }) {
  const [left, restart] = useCountdown();
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const resend = async () => {
    if (resending) return;
    setResendError('');
    if (onResend) {
      setResending(true);
      const result = await onResend();
      setResending(false);
      if (!result?.ok) { setResendError(result?.error ?? 'Could not send a new code.'); return; }
    }
    restart();
    onChange('');
  };
  return (
    <div className={`otp-entry${centered ? ' otp-entry--center' : ''}`}>
      <OtpInput value={code} onChange={onChange} invalid={Boolean(error)} />
      {error && <p className="field-error auth-error">{error}</p>}
      <p className="otp-entry__line">Code expires in: <strong>{clock(left)}</strong></p>
      <p className="otp-entry__line">Didn't receive the code? <ResendOTPButton onClick={resend} /></p>
      {resendError && <p className="field-error auth-error">{resendError}</p>}
    </div>
  );
}
