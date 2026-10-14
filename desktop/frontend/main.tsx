import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import '@/globals.css';
import { router } from '@/router';
import { AppToaster } from '@/components/AppToaster';
import { DesktopWindowChromeProvider } from '@/components/DesktopWindowChrome';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getPugyingDesktopBridge } from '@/lib/agent-client';
import { setApiBaseUrl, setLocalApiToken } from '@/lib/api';

async function bootstrap(): Promise<void> {
  const desktop = getPugyingDesktopBridge();
  if (desktop?.getApiBaseUrl) {
    try {
      const base = await desktop.getApiBaseUrl();
      setApiBaseUrl(base);
      const token = await desktop.getLocalApiToken?.();
      if (token) {
        setLocalApiToken(token);
      }
    } catch (err) {
      console.error('[pugying] failed to resolve local API base', err);
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <DesktopWindowChromeProvider>
          <AppToaster>
            <TooltipProvider delay={300}>
              <RouterProvider router={router} />
            </TooltipProvider>
          </AppToaster>
        </DesktopWindowChromeProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}

void bootstrap();

// 部署后旧标签页懒加载 chunk 404 时兜底提示刷新
window.addEventListener('vite:preloadError', () => {
  window.dispatchEvent(new CustomEvent('pugying:spa-stale'));
});
