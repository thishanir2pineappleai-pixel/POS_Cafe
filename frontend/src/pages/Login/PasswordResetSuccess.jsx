import LoginButton from '../../components/buttons/LoginButton.jsx';
import AuthLayout from '../../layout/AuthLayout.jsx';

// The designed final screen. NOTE: in this frontend-only stage no password was actually changed.
export default function PasswordResetSuccess({ onLogin }) {
  return (
    <AuthLayout title="Password Changed" subtitle={<>Your password has been successfully reset.<br />Click below to log in.</>} narrow>
      <div className="auth-form">
        <LoginButton label="Login Now" onClick={onLogin} />
      </div>
    </AuthLayout>
  );
}
