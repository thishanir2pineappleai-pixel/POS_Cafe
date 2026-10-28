import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import Dashboard from '../pages/Dashboard/Dashboard.jsx';
import NotFound from '../pages/NotFound/NotFound.jsx';
import ProductManagement from '../pages/MenuManagement/ProductManagement.jsx';
import SalesManagement from '../pages/SalesManagement/SalesManagement.jsx';
import Settings from '../pages/Settings/Settings.jsx';
import StaffManagement from '../pages/StaffManagement/StaffManagement.jsx';
import AuthFlow from './AuthFlow.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import PublicRoute from './PublicRoute.jsx';

const authFlow = <AuthFlow />;

export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route element={<PublicRoute />}>
          <Route path="/login" element={authFlow} />
          <Route path="/forgot-password" element={authFlow} />
          <Route path="/signup" element={authFlow} />
          <Route path="/signup/access-key" element={authFlow} />
          <Route path="/faq" element={authFlow} />
          <Route path="/contact-us" element={authFlow} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/staff" element={<StaffManagement />} />
          <Route path="/staff/new" element={<StaffManagement />} />
          <Route path="/staff/:id" element={<StaffManagement />} />
          <Route path="/staff/:id/edit" element={<StaffManagement />} />
          <Route path="/menu" element={<ProductManagement />} />
          <Route path="/menu/products/new" element={<ProductManagement />} />
          <Route path="/menu/products/:id" element={<ProductManagement />} />
          <Route path="/menu/products/:id/edit" element={<ProductManagement />} />
          <Route path="/sales" element={<SalesManagement />} />
          <Route path="/sales/discounts" element={<SalesManagement />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/shops" element={<Settings />} />
          <Route path="/settings/shops/new" element={<Settings />} />
          <Route path="/settings/shops/:id" element={<Settings />} />
          <Route path="/settings/shops/:id/edit" element={<Settings />} />
          <Route path="/settings/admins" element={<Settings />} />
          <Route path="/settings/admins/new" element={<Settings />} />
          <Route path="/settings/admins/:id" element={<Settings />} />
          <Route path="/settings/admins/:id/edit" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
