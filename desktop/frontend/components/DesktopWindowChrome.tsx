/**
 * 桌面主窗窗口铬：写入 CSS 变量 / data 属性，并向布局暴露 chrome 信息。
 * macOS：侧栏避让红绿灯；Windows：DesktopTitleBar 顶行 + 系统 titleBarOverlay 按钮。
 */
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getPugyingDesktopBridge } from '@/lib/agent-client';
import { useTheme } from '@/components/ThemeProvider';
import {
  MACOS_SIDEBAR_WIDTH_ICON,
  TITLEBAR_OVERLAY_THEME,
  type DesktopWindowChromeInfo,
  type TitleBarOverlayTheme,
} from '@shared/window-chrome';

type DesktopWindowChromeContextValue = {
  chrome: DesktopWindowChromeInfo | null;
  overlayTheme: TitleBarOverlayTheme;
};

const DesktopWindowChromeContext =
  createContext<DesktopWindowChromeContextValue | null>(null);

function resolveOverlayTheme(
  theme: 'dark' | 'light' | 'system',
): TitleBarOverlayTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

function clearDesktopChromeAttrs(root: HTMLElement): void {
  root.classList.remove('desktop-chrome');
  root.removeAttribute('data-desktop-controls');
  root.style.removeProperty('--desktop-titlebar-height');
  root.style.removeProperty('--desktop-titlebar-bg');
  root.style.removeProperty('--desktop-titlebar-fg');
  root.style.removeProperty('--desktop-sidebar-width-icon');
}

function applyTitlebarThemeVars(
  root: HTMLElement,
  overlayTheme: TitleBarOverlayTheme,
): void {
  const colors = TITLEBAR_OVERLAY_THEME[overlayTheme];
  root.style.setProperty('--desktop-titlebar-bg', colors.color);
  root.style.setProperty('--desktop-titlebar-fg', colors.symbolColor);
}

export function useDesktopWindowChrome(): DesktopWindowChromeContextValue {
  const value = useContext(DesktopWindowChromeContext);
  if (!value) {
    throw new Error(
      'useDesktopWindowChrome must be used within DesktopWindowChromeProvider',
    );
  }
  return value;
}

/** 顶栏等可选消费；Provider 外（如纯 SSR 测布局）视为无桌面铬 */
export function useOptionalDesktopWindowChrome(): DesktopWindowChromeContextValue | null {
  return useContext(DesktopWindowChromeContext);
}

export function DesktopWindowChromeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const [chrome, setChrome] = useState<DesktopWindowChromeInfo | null>(null);
  const [overlayTheme, setOverlayTheme] = useState<TitleBarOverlayTheme>(() =>
    resolveOverlayTheme(theme),
  );

  useEffect(() => {
    const bridge = getPugyingDesktopBridge();
    if (!bridge?.getWindowChrome) {
      return undefined;
    }
    let cancelled = false;
    void bridge.getWindowChrome().then((info) => {
      if (cancelled) {
        return;
      }
      setChrome(info);
      const root = document.documentElement;
      if (info.titleBarHeight > 0) {
        root.classList.add('desktop-chrome');
        root.setAttribute('data-desktop-controls', info.controls);
        root.style.setProperty(
          '--desktop-titlebar-height',
          `${info.titleBarHeight}px`,
        );
        // 折叠 icon 宽须盖住红绿灯；写入 html，由 CSS 覆盖 SidebarProvider 内联变量
        if (info.controls === 'trafficLights') {
          root.style.setProperty(
            '--desktop-sidebar-width-icon',
            MACOS_SIDEBAR_WIDTH_ICON,
          );
        } else {
          root.style.removeProperty('--desktop-sidebar-width-icon');
        }
      } else {
        clearDesktopChromeAttrs(root);
      }
    });
    return () => {
      cancelled = true;
      clearDesktopChromeAttrs(document.documentElement);
    };
  }, []);

  useEffect(() => {
    const resolved = resolveOverlayTheme(theme);
    setOverlayTheme(resolved);
    applyTitlebarThemeVars(document.documentElement, resolved);

    const bridge = getPugyingDesktopBridge();
    if (!bridge?.setTitleBarOverlay || !chrome || chrome.controls !== 'overlay') {
      return undefined;
    }
    const apply = (next: TitleBarOverlayTheme) => {
      void bridge.setTitleBarOverlay?.(next);
    };
    apply(resolved);
    if (theme !== 'system') {
      return undefined;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveOverlayTheme('system');
      setOverlayTheme(next);
      applyTitlebarThemeVars(document.documentElement, next);
      apply(next);
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [theme, chrome]);

  const value = useMemo(
    () => ({ chrome, overlayTheme }),
    [chrome, overlayTheme],
  );

  return (
    <DesktopWindowChromeContext.Provider value={value}>
      {children}
    </DesktopWindowChromeContext.Provider>
  );
}
