/**
 * 解析当前应采用的窗口铬平台（可被开发态环境变量覆盖）。
 * macOS 上强制 win32 只能验证布局/CSS，无法绘出真正的 Windows 标题栏按钮。
 */
import { app } from 'electron';
import { resolveRuntimeDesktopPlatform } from '../../shared/window-chrome';

let loggedForcePlatform = false;

export function currentDesktopPlatform(): string {
  const platform = resolveRuntimeDesktopPlatform(
    process.platform,
    process.env.PUGYING_FORCE_PLATFORM,
    !app.isPackaged,
  );
  if (
    !loggedForcePlatform &&
    !app.isPackaged &&
    platform !== process.platform
  ) {
    loggedForcePlatform = true;
    console.warn(
      `[pugying-desktop] PUGYING_FORCE_PLATFORM=${platform}（宿主为 ${process.platform}）；仅模拟窗口铬布局`,
    );
  }
  return platform;
}
