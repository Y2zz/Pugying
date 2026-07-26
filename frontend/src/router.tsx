import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '@/App.tsx';
import Home from '@/pages/Home.tsx';
import Dashboard from '@/pages/Dashboard.tsx';
import Login from '@/pages/Login.tsx';
import { RequireAuth } from '@/components/RequireAuth.tsx';
import { RequireAdmin } from '@/components/RequireAdmin.tsx';
import { AdminLayout } from '@/components/layouts/AdminLayout.tsx';
import AdminOverview from '@/pages/admin/Overview.tsx';
import AdminPlaceholder from '@/pages/admin/Placeholder.tsx';
import PlatformAccounts from '@/pages/PlatformAccounts.tsx';
import Contents from '@/pages/Contents.tsx';
import PublishArticle from '@/pages/PublishArticle.tsx';
import PublishVideo from '@/pages/PublishVideo.tsx';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <App />,
        children: [
          { index: true, element: <Home /> },
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'platform-accounts', element: <PlatformAccounts /> },
          { path: 'contents', element: <Contents /> },
          { path: 'publish/article', element: <PublishArticle /> },
          { path: 'publish/video', element: <PublishVideo /> },
        ],
      },
      {
        path: 'admin',
        element: <RequireAdmin />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminOverview /> },
              {
                path: 'members',
                element: <AdminPlaceholder title="成员" />,
              },
              {
                path: 'roles',
                element: <AdminPlaceholder title="角色" />,
              },
              {
                path: 'team',
                element: <AdminPlaceholder title="团队设置" />,
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
