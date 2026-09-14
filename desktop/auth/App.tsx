import { AuthToolbar } from '@auth/components/AuthToolbar';
import { FirstRunGuide } from '@auth/components/FirstRunGuide';
import { MoreMenu } from '@auth/components/MoreMenu';
import { StepBubble } from '@auth/components/StepBubble';
import { ToastOverlay } from '@auth/components/ToastOverlay';

function currentView(): string {
  return window.location.hash.replace(/^#\/?/, '');
}

export default function App() {
  const view = currentView();
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
