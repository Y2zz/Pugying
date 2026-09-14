import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type LayoutContentProps = {
  children: ReactNode;
  className?: string;
};

/**
 * inset 主内容区内边距与区块间距。
 * 滚动由外层 SidebarInset（main）负责；宽表格配合 min-w-0 防止撑破视口。
 */
export function LayoutContent({ children, className }: LayoutContentProps) {
  return (
    <div className={cn('flex flex-1 flex-col gap-6 p-4 md:p-6', className)}>{children}</div>
  );
}
