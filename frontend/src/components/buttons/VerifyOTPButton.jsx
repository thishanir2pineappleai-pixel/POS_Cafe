// "Verify Email" button of the Forgot Password code screen.
export default function VerifyOTPButton({ label = 'Verify Email', onClick, type = 'button' }) {
  return <button type={type} className="auth-btn" onClick={onClick}>{label}</button>;
}
