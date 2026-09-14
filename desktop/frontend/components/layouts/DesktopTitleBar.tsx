/**
 * Windows 专用顶栏行：独占高度与拖拽；右侧留给系统 titleBarOverlay
 *（最小化 / 最大化 / 关闭，与真实 Windows 一致）。
 * 遮罩勿盖本行：系统 caption 背景不透明，盖住后会出现右上角白块（见 globals.css）。
 */
import { useOptionalDesktopWindowChrome } from '@/components/DesktopWindowChrome';

export function DesktopTitleBar() {
  const desktop = useOptionalDesktopWindowChrome();
  const chrome = desktop?.chrome;
  if (!chrome || chrome.controls !== 'overlay' || chrome.titleBarHeight <= 0) {
    return null;
  }

  return (
    <div
      role="banner"
      aria-label="窗口标题栏"
      data-slot="desktop-titlebar"
      className="desktop-titlebar-drag relative z-50 w-full shrink-0"
      style={{
        height: chrome.titleBarHeight,
        backgroundColor: 'var(--desktop-titlebar-bg)',
        color: 'var(--desktop-titlebar-fg)',
      }}
    />
  );
}
