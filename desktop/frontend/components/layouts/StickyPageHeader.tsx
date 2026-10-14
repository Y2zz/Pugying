import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type StickyPageHeaderProps = {
  children: ReactNode;
  className?: string;
  /** 底部分割线（与内容同宽）；列表类吸顶页头可开启 */
  showDivider?: boolean;
};

/**
 * 吸顶页头：相对 SidebarInset（main）滚动容器吸顶。
 * -mt / pt 与 LayoutContent 顶边距同值，静止与吸顶时内容垂直位置一致；
 * top 固定为 0——滚动已在 inset 内，再叠 md:top-2 会在临界点跳动。
 */
export function StickyPageHeader({ children, className, showDivider = false }: StickyPageHeaderProps) {
  return (
    <div className="sticky top-0 z-30 -mt-4 md:-mt-6">
      {/* 背景层用直角铺满顶栏，避免圆角与列表之间出现楔形缝隙 */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 bottom-0 -z-10 bg-background',
          '-left-4 -right-4',
          'md:-left-6 md:-right-6',
        )}
      />
      <div
        className={cn(
          'relative flex flex-col gap-6',
          'pt-4 pb-4 -mx-4 px-4',
          'md:pt-6 md:pb-6 md:mx-0 md:px-0',
          showDivider && 'border-b border-border',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
