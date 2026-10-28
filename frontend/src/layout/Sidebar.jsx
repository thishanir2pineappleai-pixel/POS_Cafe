import { NavLink, useNavigate } from 'react-router-dom';
import LogoutButton from '../components/buttons/LogoutButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  CustomersIcon, CupIcon, DashboardIcon, InventoryIcon, SalesIcon, SettingsIcon, StaffIcon, UserIcon,
} from '../components/common/Icons.jsx';

const NAV = [
  { label: 'Dashboard', Icon: DashboardIcon, to: '/dashboard' },
  { label: 'Staff Management', Icon: StaffIcon, to: '/staff' },
  { label: 'Menu Management', Icon: CupIcon, to: '/menu' },
  { label: 'Sales Management', Icon: SalesIcon, to: '/sales' },
  { label: 'Inventory Management', Icon: InventoryIcon },
  { label: 'Customer Management', Icon: CustomersIcon },
  { label: 'Settings', Icon: SettingsIcon, to: '/settings' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const logout = async () => { await signOut(); navigate('/login', { replace: true }); };

  return (
    <aside className="sidebar">
      <nav className="sidebar__nav">
        {NAV.map(({ label, Icon, to }) => to ? (
          <NavLink key={label} to={to} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}>
            <Icon size={20} />
            {label}
          </NavLink>
        ) : (
          <button type="button" key={label} className="nav-item" disabled aria-disabled="true">
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
        <LogoutButton onClick={logout} />
      </div>
      <div className="sidebar__footer">Powered by PineappleAI</div>
    </aside>
  );
}
