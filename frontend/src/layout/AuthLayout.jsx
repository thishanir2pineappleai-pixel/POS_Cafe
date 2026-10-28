import logo from '../assets/logos/pai-pos-logo-large.png';

// Centered column used by Login, Forgot Password, Code Verification, Set new password and Password Changed.
export default function AuthLayout({ title, subtitle, children, narrow = false }) {
  return (
    <div className="auth-page">
      <div className={`auth-column${narrow ? ' auth-column--narrow' : ''}`}>
        <img className="auth-logo" src={logo} alt="PAI POS" />
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
