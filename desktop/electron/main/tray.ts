import trayIconAsset from '../../assets/tray-icon.png?asset';
import {
  app,
  Menu,
  nativeImage,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage,
} from 'electron';
import { showAppWindow } from './app-window';
import {
  AGENT_VERSION,
} from './protocol';
import {
  closeAllBrowseWindows,
  disposeAllAuthJobs,
  getActiveAuthJobCount,
  getActiveBrowseWindowCount,
} from './auth-browser';
import { notifyUser } from './notify';

let tray: Tray | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromPath(trayIconAsset);
  if (image.isEmpty()) {
    // Fallback if asset missing after unexpected cwd/outDir
    return nativeImage.createEmpty();
  }
  // 资产为白前景 + 透明底；勿开 template（template 期望黑剪影）
  const size = process.platform === 'darwin' ? 22 : 16;
  return image.resize({ width: size, height: size, quality: 'best' });
}

function buildMenuTemplate(): MenuItemConstructorOptions[] {
  const authJobs = getActiveAuthJobCount();
  const browseWindows = getActiveBrowseWindowCount();

  return [
    {
      label: `蒲公英 ${AGENT_VERSION}`,
      enabled: false,
    },
    { label: '个人单机版', enabled: false },
    { type: 'separator' },
    {
      label: '显示主窗口',
      click: () => {
        showAppWindow();
      },
    },
    { type: 'separator' },
    {
      label: '关闭进行中的授权窗口',
      enabled: authJobs > 0,
      click: () => {
        const count = getActiveAuthJobCount();
        void disposeAllAuthJobs().then(() => {
          refreshTrayMenu();
          // No window left to carry the feedback — OS notification tier.
          notifyUser(null, `已关闭 ${count} 个授权窗口`, 'success');
        });
      },
    },
    {
      label: '关闭创作者中心窗口',
      enabled: browseWindows > 0,
      click: () => {
        // Graceful close so each window still runs its cookie write-back.
        const count = closeAllBrowseWindows();
        refreshTrayMenu();
        notifyUser(null, `已关闭 ${count} 个创作者中心窗口`);
      },
    },
    {
      label: '刷新状态',
      click: () => {
        refreshTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: '退出蒲公英',
      accelerator: process.platform === 'darwin' ? 'Cmd+Q' : undefined,
      click: () => {
        app.quit();
      },
    },
  ];
}

export function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
  tray.setToolTip(`蒲公英 ${AGENT_VERSION}\n个人单机版`);
}

export function createTray(): Tray {
  tray = new Tray(createTrayIcon());
  refreshTrayMenu();

  // Windows/Linux: left-click shows menu; macOS uses setContextMenu on click
  if (process.platform !== 'darwin') {
    tray.on('click', () => {
      refreshTrayMenu();
      showAppWindow();
    });
  } else {
    // macOS：左键恢复主窗，右键菜单
    tray.on('click', () => {
      showAppWindow();
    });
  }
  tray.on('right-click', () => {
    refreshTrayMenu();
    tray?.popUpContextMenu();
  });

  refreshTimer = setInterval(() => {
    refreshTrayMenu();
  }, 3000);

  return tray;
}

export function destroyTray(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
