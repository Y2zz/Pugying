import { Link } from 'react-router-dom';

import { Logo } from '@/components/Logo';

/**
 * 侧栏品牌区：Logo + 产品名，点击回首页。
 * 版本号在底栏产品更新入口展示，此处不再重复。
 * 折叠时只藏文案，固定 h-12；宽度收为内容以便 Header 居中。
 */
export function AppBrand() {
  return (
    <Link
      to="/dashboard"
      title="Pugying"
      className="desktop-titlebar-no-drag flex h-12 w-full items-center gap-2 overflow-hidden rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:w-auto"
    >
      <div className="flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        <Logo className="size-8" />
      </div>
      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate font-medium">Pugying</span>
        <span className="truncate text-xs text-muted-foreground">蒲公英</span>
      </div>
    </Link>
  );
}
