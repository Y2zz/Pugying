import { useEffect, useState } from 'react';
import { AuthToolbar } from '@auth/components/AuthToolbar';
import { FirstRunGuide } from '@auth/components/FirstRunGuide';
import { MoreMenu } from '@auth/components/MoreMenu';
import { StepBubble } from '@auth/components/StepBubble';
import { ToastOverlay } from '@auth/components/ToastOverlay';

const OVERLAY_VIEWS = new Set([
  'more-menu',
  'guide-first',
  'guide-bubble',
  'toasts',
]);

function currentView(): string {
  return window.location.hash.replace(/^#\/?/, '');
}

/** 叠层视图切换时同步 html class，保持透明底（与 main.tsx 首屏逻辑一致） */
function syncOverlayHtmlClass(view: string): void {
  const root = document.documentElement;
  for (const name of OVERLAY_VIEWS) {
    root.classList.toggle(name, name === view);
  }
}

export default function App() {
  // 同文档仅改 hash（guide-first → guide-bubble）时不会整页重载，须订阅 hashchange
  const [view, setView] = useState(currentView);

  useEffect(() => {
    const onHashChange = () => {
      const next = currentView();
      syncOverlayHtmlClass(next);
      setView(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  if (view === 'more-menu') {
    return <MoreMenu />;
  }
  if (view === 'guide-first') {
    return <FirstRunGuide />;
  }
  if (view === 'guide-bubble') {
    return <StepBubble />;
  }
  if (view === 'toasts') {
    return <ToastOverlay />;
  }
  if (view === 'browse') {
    return <AuthToolbar variant="browse" />;
  }
  return <AuthToolbar />;
}
