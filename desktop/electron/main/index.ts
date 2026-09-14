import { app, Menu, dialog, nativeImage } from 'electron';
import appIconAsset from '../../assets/app-icon.png?asset';
import {
  createAppWindow,
  markAppQuitting,
  showAppWindow,
} from './app-window';
import { wireDesktopIpc } from './app-ipc';
import {
  startLocalServer,
  stopLocalServer,
} from './server-process';
import { createTray, destroyTray } from './tray';

let allowQuit = false;

/**
 * Replace Electron's default application menu, whose View→Reload
 * accelerators (Cmd/Ctrl+R) reload the focused WebContents. Reloading the
 * auth/overlay views corrupts the auth window (blank toolbar, stuck
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

app.whenReady().then(async () => {
  // 桌面一体：业务主窗常驻，Dock/任务切换应可见
  if (process.platform === 'darwin') {
    void app.dock?.show();
    // 开发态使用同一套 App 图标；打包后 Finder 由 icns 负责
    const dockIcon = nativeImage.createFromPath(appIconAsset);
    if (!dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon);
    }
  }

  installAppMenu();
  wireDesktopIpc();
  createTray();
  try {
    await startLocalServer();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pugying-desktop] local server failed:', message);
    dialog.showErrorBox('本机服务启动失败', message);
  }

  createAppWindow();
  console.log(
    '[pugying-desktop] ready (local server + app IPC + chrome auth shell)',
  );
});

app.on('activate', () => {
  showAppWindow();
});

app.on('window-all-closed', () => {
  // 主窗隐藏到托盘后仍保留进程；不在此处 quit
});

app.on('before-quit', (event) => {
  if (allowQuit) {
    return;
  }
  event.preventDefault();
  markAppQuitting();
  void (async () => {
    destroyTray();
    await stopLocalServer();
    allowQuit = true;
    app.quit();
  })();
});
