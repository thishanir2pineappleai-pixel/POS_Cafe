import { EyeIcon, EyeOffIcon } from '../common/Icons.jsx';

// Eye toggle inside a password field. `visible` means the password is currently shown as text.
export default function ShowPasswordButton({ visible, onClick }) {
  return (
    <button type="button" className="eye-btn" onClick={onClick} aria-label={visible ? 'Hide password' : 'Show password'}>
      {visible ? <EyeIcon size={18} /> : <EyeOffIcon size={18} />}
    </button>
  );
}
