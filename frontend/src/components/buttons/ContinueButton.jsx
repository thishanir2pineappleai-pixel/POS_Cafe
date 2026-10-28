export default function ContinueButton({ label = 'Continue', onClick, type = 'button' }) {
  return <button type={type} className="auth-btn" onClick={onClick}>{label}</button>;
}
