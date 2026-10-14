/**
 * 托盘图标资源：与产品彩色 Logo 分开，便于菜单栏使用单色标。
 * 经 electron-vite `?asset` 打进主进程产物。
 */
import { nativeImage, type NativeImage } from 'electron';
import trayIconPath from '../../assets/tray.png?asset';

let cached: NativeImage | null = null;

/** 懒加载托盘图；失败时返回 empty，由调用方回退。 */
export function getTrayIconNativeImage(): NativeImage {
  if (cached) {
    return cached;
  }
  cached = nativeImage.createFromPath(trayIconPath);
  return cached;
}
