import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/components/ThemeProvider';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

function resolveAppearance(theme: 'dark' | 'light' | 'system'): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/** 侧栏：仅图标的浅色 / 深色切换 */
export function NavThemeToggle() {
  const { theme, setTheme } = useTheme();
  const appearance = resolveAppearance(theme);
  // 图标表示「点击后将切到」的目标，与键盘 D 快捷键语义一致
  const nextTheme = appearance === 'dark' ? 'light' : 'dark';
  const label = nextTheme === 'dark' ? '切换深色' : '切换浅色';
  const Icon = nextTheme === 'dark' ? Moon : Sun;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={label}
        type="button"
        className="w-auto! justify-center group-data-[collapsible=icon]:size-8!"
        onClick={() => {
          setTheme(nextTheme);
        }}
      >
        <Icon />
        <span className="sr-only">{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
