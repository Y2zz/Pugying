import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import '@/globals.css';
import { router } from '@/router.tsx';
import { AppToaster } from '@/components/AppToaster.tsx';
import { ThemeProvider } from '@/components/ThemeProvider.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AppToaster>
        <TooltipProvider delay={300}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </AppToaster>
    </ThemeProvider>
  </StrictMode>,
);

// 部署后旧标签页懒加载 chunk 404 时兜底提示刷新
window.addEventListener('vite:preloadError', () => {
  window.dispatchEvent(new CustomEvent('pugying:spa-stale'));
});
