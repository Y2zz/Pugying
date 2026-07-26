import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { clearSession, isAuthenticated, refreshClaims } from '@/lib/api';

/**
 * Gate authenticated routes and once-per-mount refresh JWT claims so role
 * permission updates (e.g. new modules) apply without forcing re-login.
 */
export function RequireAuth() {
  const location = useLocation();
  // 未登录时无需刷新 claims，初始即 ready，避免 effect 内同步 setState
  const [ready, setReady] = useState(() => !isAuthenticated());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await refreshClaims();
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (/unauthorized|401/i.test(message)) {
          clearSession();
          if (!cancelled) {
            setFailed(true);
          }
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAuthenticated() || failed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!ready) {
    return null;
  }

  return <Outlet />;
}
