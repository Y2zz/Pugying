import { renderToString } from 'react-dom/server';
import { vi } from 'vitest';
import { DesktopTitleBar } from '@/components/layouts/DesktopTitleBar';
import {
  DESKTOP_TITLEBAR_HEIGHT,
  type DesktopWindowChromeInfo,
} from '@shared/window-chrome';

const mockDesktopChrome = vi.hoisted(() => ({
  current: null as {
    chrome: DesktopWindowChromeInfo | null;
    overlayTheme: 'light' | 'dark';
  } | null,
}));

vi.mock('@/components/DesktopWindowChrome', () => ({
  useOptionalDesktopWindowChrome: () => mockDesktopChrome.current,
}));

describe('DesktopTitleBar', () => {
  it('renders nothing when chrome is absent', () => {
    mockDesktopChrome.current = null;
    expect(renderToString(<DesktopTitleBar />)).toBe('');
  });

  it('renders nothing for macOS traffic lights', () => {
    mockDesktopChrome.current = {
      chrome: {
        platform: 'darwin',
        titleBarHeight: DESKTOP_TITLEBAR_HEIGHT,
        controls: 'trafficLights',
      },
      overlayTheme: 'light',
    };
    expect(renderToString(<DesktopTitleBar />)).toBe('');
  });

  it('renders a dedicated titlebar row for Windows overlay', () => {
    mockDesktopChrome.current = {
      chrome: {
        platform: 'win32',
        titleBarHeight: DESKTOP_TITLEBAR_HEIGHT,
        controls: 'overlay',
      },
      overlayTheme: 'light',
    };
    const html = renderToString(<DesktopTitleBar />);
    expect(html).toContain('data-slot="desktop-titlebar"');
    expect(html).toContain(`height:${DESKTOP_TITLEBAR_HEIGHT}`);
    expect(html).toContain('窗口标题栏');
    // 按钮由系统 titleBarOverlay 绘制，HTML 顶栏不含 caption；
    // 遮罩须避开本行（globals.css），否则 caption 白底会露出白块
    expect(html).not.toContain('最小化');
  });
});
