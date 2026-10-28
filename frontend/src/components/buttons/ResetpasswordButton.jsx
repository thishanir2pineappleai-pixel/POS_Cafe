export default function ResetpasswordButton({ label = 'Reset password', onClick, type = 'button' }) {
  return <button type={type} className="auth-btn" onClick={onClick}>{label}</button>;
}
