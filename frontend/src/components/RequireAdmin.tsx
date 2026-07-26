import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredUser, isAuthenticated } from '@/lib/api';
import { canAccessAdmin } from '@/lib/permissions';

export function RequireAdmin() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const user = getStoredUser();
  if (!canAccessAdmin(user?.permissions)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
