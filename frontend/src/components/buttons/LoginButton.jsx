// Full-width green action button of the Login family of screens (Login, Login Now).
export default function LoginButton({ label = 'Login', onClick, type = 'button', disabled = false }) {
  return (
    <button type={type} className="auth-btn" onClick={onClick} disabled={disabled}>{label}</button>
  );
}
