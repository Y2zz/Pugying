import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  /** 标题插槽简写；与 `PageHeaderTitle` 二选一 */
  title?: ReactNode;
  /** 描述插槽简写；与 `PageHeaderDescription` 二选一 */
  description?: ReactNode;
  /** 右侧操作区简写；与 `PageHeaderAction` 二选一 */
  action?: ReactNode;
  /** 组合插槽：`PageHeaderTitle` / `PageHeaderDescription` / `PageHeaderAction` */
  children?: ReactNode;
  className?: string;
};

/** 业务页顶栏，与各页内联 h1 + 描述块样式一致。 */
export function PageHeader({ title, description, action, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'grid auto-rows-min items-start gap-1',
        'has-data-[slot=page-header-action]:grid-cols-[1fr_auto]',
        'has-data-[slot=page-header-description]:grid-rows-[auto_auto]',
        className
      )}
    >
      {children ?? (
        <>
          {title != null ? <PageHeaderTitle>{title}</PageHeaderTitle> : null}
          {description != null ? <PageHeaderDescription>{description}</PageHeaderDescription> : null}
          {action != null ? <PageHeaderAction>{action}</PageHeaderAction> : null}
        </>
      )}
    </div>
  );
}

export function PageHeaderTitle({ className, ...props }: ComponentProps<'h1'>) {
  return <h1 data-slot="page-header-title" className={cn('font-heading text-2xl tracking-tight', className)} {...props} />;
}

export function PageHeaderDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="page-header-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

/** 标题行右侧操作区，与 CardAction 同网格定位 */
export function PageHeaderAction({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header-action"
      className={cn('col-start-2 row-span-2 row-start-1 flex flex-wrap items-center gap-2 self-start justify-self-end', className)}
      {...props}
    />
  );
}
