import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingState from '../components/common/LoadingState.jsx';

export default function PublicRoute() {
  const { signedIn, checking } = useAuth();
  const location = useLocation();

  if (checking) return <LoadingState message="Checking your session..." />;
  if (signedIn) {
    const from = location.state?.from;
    return <Navigate to={from ? { pathname: from.pathname, search: from.search, hash: from.hash } : '/dashboard'} replace />;
  }
  return <Outlet />;
}
