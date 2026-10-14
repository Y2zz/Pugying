import { useEffect, useState } from 'react';
import {
  readUiDensity,
  writeUiDensity,
  UI_DENSITY_CHANGED_EVENT,
  type UiDensity,
} from '@/lib/ui-density';

/**
 * 全局列表密度（舒适 / 紧凑）。
 * 用户菜单修改后，各列表页通过同页事件 + storage 跨标签同步。
 */
export function useUiDensity() {
  const [density, setDensityState] = useState<UiDensity>(() => readUiDensity());

  useEffect(() => {
    const sync = () => {
      setDensityState(readUiDensity());
    };
    window.addEventListener(UI_DENSITY_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(UI_DENSITY_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setDensity = (next: UiDensity) => {
    writeUiDensity(next);
    setDensityState(next);
  };

  return {
    density,
    setDensity,
    compact: density === 'compact',
  };
}
