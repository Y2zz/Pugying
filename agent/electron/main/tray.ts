import trayIconAsset from '../../assets/tray-icon.png?asset';
import {
  app,
  clipboard,
  Menu,
  nativeImage,
  shell,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage,
} from 'electron';
import {
  AGENT_VERSION,
  AGENT_WS_HOST,
  AGENT_WS_PORT,
} from './protocol';
import {
  closeAllBrowseWindows,
  disposeAllAuthJobs,
  getActiveAuthJobCount,
  getActiveBrowseWindowCount,
} from './auth-browser';
import { notifyUser } from './notify';
import { getConnectedClientCount } from './ws-server';

const WS_URL = `ws://${AGENT_WS_HOST}:${AGENT_WS_PORT}`;
const FRONTEND_URL = 'http://localhost:5173';

let tray: Tray | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromPath(trayIconAsset);
  if (image.isEmpty()) {
    // Fallback if asset missing after unexpected cwd/outDir
    return nativeImage.createEmpty();
  }
  if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }
  return image;
}

function buildMenuTemplate(): MenuItemConstructorOptions[] {
  const clients = getConnectedClientCount();
  const authJobs = getActiveAuthJobCount();
  const browseWindows = getActiveBrowseWindowCount();

  return [
    {
      label: `Pugying Agent ${AGENT_VERSION}`,
      enabled: false,
    },
    {
      label: clients > 0 ? `状态：已连接（${clients}）` : '状态：等待前端连接',
      enabled: false,
    },
    {
      label: `进行中授权：${authJobs}`,
      enabled: false,
    },
    {
      label: `创作者中心窗口：${browseWindows}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: WS_URL,
      enabled: false,
    },
    {
      label: '复制 WebSocket 地址',
      click: () => {
        clipboard.writeText(WS_URL);
      },
    },
    {
      label: '打开前端（开发）',
      click: () => {
        void shell.openExternal(FRONTEND_URL);
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
      label: '退出 Agent',
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
  const clients = getConnectedClientCount();
  tray.setToolTip(
    `Pugying Agent ${AGENT_VERSION}\n${WS_URL}\n前端连接：${clients}`,
  );
}

export function createTray(): Tray {
  tray = new Tray(createTrayIcon());
  refreshTrayMenu();

  // Windows/Linux: left-click shows menu; macOS uses setContextMenu on click
  if (process.platform !== 'darwin') {
    tray.on('click', () => {
      refreshTrayMenu();
      tray?.popUpContextMenu();
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
