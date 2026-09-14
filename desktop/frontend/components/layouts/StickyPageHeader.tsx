import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type StickyPageHeaderProps = {
  children: ReactNode;
  className?: string;
  /** 底部分割线（与内容同宽）；列表类吸顶页头可开启 */
  showDivider?: boolean;
};

/**
 * 吸顶页头容器：相对 SidebarInset（main）滚动容器吸顶；
 * 内层 pt-2 + 外层 -mt-2 纯 CSS 顶距；背景层铺满 inset 顶边防透出。
 */
export function StickyPageHeader({ children, className, showDivider = false }: StickyPageHeaderProps) {
  return (
    <div
      className={cn(
        'relative sticky -mt-2 z-30 top-0 md:top-2',
      )}
    >
      {/* 背景层用直角铺满顶栏，避免圆角与列表之间出现楔形缝隙 */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -left-4 -right-4 top-0 bottom-0 -z-10 bg-background',
          'md:-left-6 md:-right-6 md:-top-2',
        )}
      />
      <div
        className={cn(
          'relative flex flex-col gap-6',
          '-mx-4 px-4 pt-2 pb-4',
          'md:mx-0 md:px-0 md:pb-6',
          showDivider && 'border-b border-border',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
