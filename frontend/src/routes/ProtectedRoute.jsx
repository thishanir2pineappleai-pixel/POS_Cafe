import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingState from '../components/common/LoadingState.jsx';

export default function ProtectedRoute() {
  const { signedIn, checking } = useAuth();
  const location = useLocation();

  if (checking) return <LoadingState message="Checking your session..." />;
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
