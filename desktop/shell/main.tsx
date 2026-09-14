import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './globals.css';

const view = window.location.hash.replace(/^#\/?/, '');
if (
  view === 'more-menu' ||
  view === 'guide-first' ||
  view === 'guide-bubble' ||
  view === 'toasts'
) {
  document.documentElement.classList.add(view);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
