import { useState } from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext.jsx';
import { NavigationContext } from '../context/NavigationContext.jsx';
import Dashboard from '../pages/Dashboard/Dashboard.jsx';
import ProductManagement from '../pages/MenuManagement/ProductManagement.jsx';
import SalesManagement from '../pages/SalesManagement/SalesManagement.jsx';
import Settings from '../pages/Settings/Settings.jsx';
import StaffManagement from '../pages/StaffManagement/StaffManagement.jsx';
import AuthFlow from './AuthFlow.jsx';

const PAGES = ['Dashboard', 'Staff Management', 'Menu Management', 'Sales Management', 'Settings'];

// ponytail: no router library is installed, so the sidebar switches between the built pages with state.
// Only the open page is mounted, so every visit loads fresh data from the API (a product added in Menu Management shows up in
// the Dashboard stock card, for example). Swap this for real routes (react-router) once more pages exist.
const COMPONENTS = {
  Dashboard, 'Staff Management': StaffManagement, 'Menu Management': ProductManagement, 'Sales Management': SalesManagement, Settings,
};

function SignedInPages() {
  const [page, setPage] = useState('Dashboard');
  const navigate = (label) => { if (PAGES.includes(label)) setPage(label); };
  const Page = COMPONENTS[page];

  return (
    <NavigationContext.Provider value={navigate}>
      <Page />
    </NavigationContext.Provider>
  );
}

// "Signed in" means the Auth Service accepted the login (see AuthContext). While a stored session is being checked nothing is
// shown, so the login screen does not flash before the app.
function Screens() {
  const { signedIn, checking } = useAuth();
  if (checking) return null;
  return signedIn ? <SignedInPages /> : <AuthFlow />;
}

export default function AppRoutes() {
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}
