import { AuthToolbar } from '@shell/components/AuthToolbar';
import { FirstRunGuide } from '@shell/components/FirstRunGuide';
import { MoreMenu } from '@shell/components/MoreMenu';
import { StepBubble } from '@shell/components/StepBubble';
import { ToastOverlay } from '@shell/components/ToastOverlay';

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
