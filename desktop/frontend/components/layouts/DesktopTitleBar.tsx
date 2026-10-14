/**
 * Windows 专用顶栏行：独占高度与拖拽；最左 Menubar，右侧留给系统
 * titleBarOverlay（最小化 / 最大化 / 关闭）。
 * 遮罩勿盖本行：系统 caption 背景不透明，盖住后会出现右上角白块（见 globals.css）。
 */
import { DesktopAppMenubar } from '@/components/layouts/DesktopAppMenubar';
import { useOptionalDesktopWindowChrome } from '@/components/DesktopWindowChrome';

/** 无 titlebar-area env 时 Windows caption 约三按钮宽度 */
const TITLEBAR_CAPTION_FALLBACK_PX = 138;

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
      className="desktop-titlebar-drag relative z-50 flex w-full shrink-0 items-center"
      style={{
        height: chrome.titleBarHeight,
        backgroundColor: 'var(--desktop-titlebar-bg)',
        color: 'var(--desktop-titlebar-fg)',
        // 可交互区对齐 Chromium titlebar-area；右侧留给系统 caption
        paddingInlineStart: 'env(titlebar-area-x, 0px)',
        paddingInlineEnd: `max(${TITLEBAR_CAPTION_FALLBACK_PX}px, calc(100% - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100%)))`,
      }}
    >
      <div className="flex min-w-0 items-center px-2">
        <DesktopAppMenubar />
      </div>
    </div>
  );
}
