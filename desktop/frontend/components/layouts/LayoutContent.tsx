import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type LayoutContentProps = {
  children: ReactNode;
  className?: string;
};

/**
 * inset 主内容区内边距与区块间距。
 * 对齐 sidebar-08：文档级滚动，宽表格场景配合 SidebarInset 的 min-w-0 防止撑破视口。
 */
export function LayoutContent({ children, className }: LayoutContentProps) {
  return (
    <div className={cn('flex flex-1 flex-col gap-6 p-4 md:p-6', className)}>{children}</div>
  );
}
