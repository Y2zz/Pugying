/**
 * 产品 Logo（native）：供关于框、窗口图标共用（托盘用独立 tray.png）。
 * 资源在 desktop/assets，经 electron-vite `?asset` 打进主进程产物，勿依赖 build/。
 */
import { nativeImage, type NativeImage } from 'electron';
import productLogoPath from '../../assets/logo.png?asset';

let cached: NativeImage | null = null;

/** 解析打包后的 Logo 绝对路径（dialog / BrowserWindow.icon 等需要 path）。 */
export function getProductLogoPath(): string {
  return productLogoPath;
}

/** 懒加载并缓存 NativeImage，避免重复读盘。 */
export function getProductLogoNativeImage(): NativeImage {
  if (cached) {
    return cached;
  }
  cached = nativeImage.createFromPath(productLogoPath);
  return cached;
}
