/** 列表卡片显示密度：作品管理等共用 */

export type UiDensity = 'comfortable' | 'compact';

export const UI_DENSITY_STORAGE_KEY = 'pugying.ui.density';
/** 同页多组件同步；跨标签页走 storage 事件 */
export const UI_DENSITY_CHANGED_EVENT = 'pugying:ui-density-changed';

const LEGACY_DENSITY_KEYS = ['pugying.contents.density', 'pugying.media-library.density'] as const;

function parseDensity(raw: string | null): UiDensity | null {
  if (raw === 'comfortable' || raw === 'compact') {
    return raw;
  }
  return null;
}

/** 读全局密度；兼容旧版分页面存储键 */
export function readUiDensity(): UiDensity {
  try {
    const current = parseDensity(localStorage.getItem(UI_DENSITY_STORAGE_KEY));
    if (current) {
      return current;
    }
    for (const key of LEGACY_DENSITY_KEYS) {
      const legacy = parseDensity(localStorage.getItem(key));
      if (legacy) {
        // 迁移到全局键，避免各页继续分叉
        localStorage.setItem(UI_DENSITY_STORAGE_KEY, legacy);
        return legacy;
      }
    }
  } catch {
    // 隐私模式等读失败时回退默认
  }
  return 'comfortable';
}

export function writeUiDensity(density: UiDensity): void {
  try {
    localStorage.setItem(UI_DENSITY_STORAGE_KEY, density);
    for (const key of LEGACY_DENSITY_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // 写失败不影响当次内存态
  }
  window.dispatchEvent(new CustomEvent(UI_DENSITY_CHANGED_EVENT, { detail: density }));
}
