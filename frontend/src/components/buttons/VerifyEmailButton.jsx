// "Verify email" button of the Signup email-verification step.
export default function VerifyEmailButton({ label = 'Verify email', onClick, type = 'button' }) {
  return <button type={type} className="signup-btn signup-btn--block" onClick={onClick}>{label}</button>;
}
