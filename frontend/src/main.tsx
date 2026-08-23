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
  </StrictMode>
);
