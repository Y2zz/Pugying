import { createBrowserRouter, createHashRouter, Navigate } from 'react-router-dom';
import App from '@/App';
import Dashboard from '@/pages/Dashboard';
import PlatformAccounts from '@/pages/PlatformAccounts';
import Contents from '@/pages/Contents';
import PublishArticle from '@/pages/PublishArticle';
import PublishVideo from '@/pages/PublishVideo';
import Preferences from '@/pages/Preferences';

const routes = [
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'platform-accounts', element: <PlatformAccounts /> },
      { path: 'contents', element: <Contents /> },
      { path: 'publish/article', element: <PublishArticle /> },
      { path: 'publish/video', element: <PublishVideo /> },
      { path: 'preferences', element: <Preferences /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
];

// 桌面端 loadFile 需 Hash 路由；浏览器开发/部署仍用 History 路由
const useHashRouter = import.meta.env.VITE_ROUTER_MODE === 'hash';

export const router = useHashRouter
  ? createHashRouter(routes)
  : createBrowserRouter(routes);
