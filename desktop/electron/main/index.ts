import { app, Menu, dialog } from 'electron';
import {
  createAppWindow,
  getAppWindow,
  markAppQuitting,
  showAppWindow,
} from './app-window';
import { wireDesktopIpc } from './app-ipc';
import {
  startLocalServer,
  stopLocalServer,
} from './server-process';
import { createTray, destroyTray } from './tray';
import { recoverInterruptedDistributions, stopDistributions } from './distribution-service';
import { installChromeLikeUserAgent } from './platforms/chrome-like-user-agent';
import { registerPublishMediaScheme } from './platforms/publish-media-protocol';

registerPublishMediaScheme();

/** 清理已完成，允许 before-quit 放行真正的退出 */
let allowQuit = false;
/** 避免 Dock / Cmd+Q 连点时重复启动清理 */
let quitCleanupStarted = false;

// 队列和本机数据只由一个桌面进程管理，重复打开时聚焦已有窗口。
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}
app.on('second-instance', () => {
  showAppWindow();
});

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
  // session.defaultSession 仅 ready 后可用；须在任何窗口创建前安装
  installChromeLikeUserAgent();

  // 桌面一体：业务主窗常驻，Dock/任务切换应可见
  if (process.platform === 'darwin') {
    void app.dock?.show();
  }

  installAppMenu();
  wireDesktopIpc();
  createTray();
  try {
    await startLocalServer();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pugying-desktop] local server failed:', message);
    dialog.showErrorBox('蒲公英启动失败', message);
  }

  try {
    await recoverInterruptedDistributions();
  } catch {
    console.error('[pugying-desktop] could not reconcile interrupted distributions');
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
  // 拦截首次退出做异步清理；清理完成后再发一次真正的 quit
  event.preventDefault();
  if (quitCleanupStarted) {
    return;
  }
  quitCleanupStarted = true;
  markAppQuitting();
  void (async () => {
    try {
      // 先拆主窗：避免本机 HTTP 长连接拖住 Nest close，也避免关窗被当成「藏托盘」
      const win = getAppWindow();
      if (win) {
        win.destroy();
      }
      destroyTray();
      await stopDistributions();
      await stopLocalServer();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[pugying-desktop] quit cleanup failed:', message);
    } finally {
      allowQuit = true;
      // 必须放到下一宏任务：在同一 before-quit 的 Promise 微任务里再 app.quit()
      // 会复入尚未结束的 macOS 退出事务，只关窗并走到 window-all-closed，
      // 进程仍留在 Dock，表现为「要退出两次」。
      setImmediate(() => {
        app.quit();
      });
    }
  })();
});
