import { cn } from '@/lib/utils';

import logoMark from '@/assets/pugying-icon-light-mono.png';

/** 侧栏等处的产品标：直接使用提供的浅色单色图标资产 */
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
