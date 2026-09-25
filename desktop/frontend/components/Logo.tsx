import { cn } from '@/lib/utils';

import logoMark from '@/assets/pugying-icon-light-mono.png';

/** 产品标：侧栏品牌区、Windows 顶栏等复用同一浅色单色图标资产 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={logoMark}
      alt=""
      aria-hidden
      draggable={false}
      className={cn('object-contain', className)}
    />
  );
}
