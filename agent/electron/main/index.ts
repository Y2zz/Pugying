import { app, Menu } from 'electron';
import type { WebSocketServer } from 'ws';
import { startAgentWsServer } from './ws-server';
import { createTray, destroyTray } from './tray';

let wss: WebSocketServer | null = null;

/**
 * Replace Electron's default application menu, whose View→Reload
 * accelerators (Cmd/Ctrl+R) reload the focused WebContents. Reloading the
 * shell/overlay views corrupts the auth window (blank toolbar, stuck
 * overlays), so reload must only happen via the toolbar button.
 * - macOS: keep app/edit/window roles (clipboard & Cmd+W still work).
 * - Win/Linux: drop the menu bar entirely; no menu → no accelerators.
 */
function installAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { label: 'File', submenu: [{ role: 'close' }] },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  if (!app.isPackaged) {
    // Dev-only: keep DevTools reachable without restoring reload roles.
    template.push({ label: 'View', submenu: [{ role: 'toggleDevTools' }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  installAppMenu();

  createTray();
  wss = startAgentWsServer();
  console.log(
    '[pugying-agent] ready (stateless, chrome auth shell, isolated partitions)',
  );
});

app.on('window-all-closed', () => {
  // Keep agent running with tray + WS; auth windows may open/close.
});

app.on('before-quit', () => {
  if (wss) {
    wss.close();
    wss = null;
  }
  destroyTray();
});
