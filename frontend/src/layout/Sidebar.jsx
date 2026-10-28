import LogoutButton from '../components/buttons/LogoutButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from '../context/NavigationContext.jsx';
import {
  CustomersIcon, CupIcon, DashboardIcon, InventoryIcon, SalesIcon, SettingsIcon, StaffIcon, UserIcon,
} from '../components/common/Icons.jsx';

const NAV = [
  { label: 'Dashboard', Icon: DashboardIcon },
  { label: 'Staff Management', Icon: StaffIcon },
  { label: 'Menu Management', Icon: CupIcon },
  { label: 'Sales Management', Icon: SalesIcon },
  { label: 'Inventory Management', Icon: InventoryIcon },
  { label: 'Customer Management', Icon: CustomersIcon },
  { label: 'Settings', Icon: SettingsIcon },
];

// ponytail: Inventory and Customer Management are not built yet, so those items do nothing.
// The name and email are the signed-in user's. Logout ends the session and returns to the login screens.
export default function Sidebar({ active = 'Menu Management' }) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  return (
    <aside className="sidebar">
      <nav className="sidebar__nav">
        {NAV.map(({ label, Icon }) => (
          <button type="button" key={label} className={`nav-item${label === active ? ' nav-item--active' : ''}`}
            aria-current={label === active ? 'page' : undefined} onClick={() => navigate(label)}>
            <Icon size={20} />
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar__user">
        <div className="sidebar__profile">
          <span className="avatar"><UserIcon size={16} /></span>
          <div>
            <div className="user-name">{user ? `${user.firstName} ${user.lastName}`.trim() : ''}</div>
            <div className="user-email">{user?.email ?? ''}</div>
          </div>
        </div>
        <LogoutButton onClick={signOut} />
      </div>
      <div className="sidebar__footer">Powered by PineappleAI</div>
    </aside>
  );
}
