import * as React from 'react';

/** 与 Tailwind `lg` 一致：低于此宽度侧栏自动收为 icon 模式 */
export const SIDEBAR_EXPAND_BREAKPOINT = 1024;

function readExpanded(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.matchMedia(`(min-width: ${SIDEBAR_EXPAND_BREAKPOINT}px)`).matches;
}

/**
 * 侧栏展开态随视口响应，无手动折叠按钮。
 * ≥1024px 展开；<1024px 收为 icon（由 Sidebar collapsible="icon" 呈现）。
 */
export function useSidebarExpanded(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [open, setOpen] = React.useState(readExpanded);

  React.useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SIDEBAR_EXPAND_BREAKPOINT}px)`);
    const sync = () => {
      setOpen(mq.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
    };
  }, []);

  return [open, setOpen];
}
