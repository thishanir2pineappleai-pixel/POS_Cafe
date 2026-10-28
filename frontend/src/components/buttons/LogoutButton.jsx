import { LogoutIcon } from '../common/Icons.jsx';

// The Sidebar passes AuthContext's signOut: it ends the session on the server and switches back to the login screens.
export default function LogoutButton({ onClick }) {
  return (
    <button type="button" className="logout-btn" onClick={onClick}>
      <LogoutIcon size={18} />
      Logout
    </button>
  );
}
