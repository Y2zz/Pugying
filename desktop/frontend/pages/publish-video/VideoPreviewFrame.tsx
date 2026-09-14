import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 发布页预览区固定宽度（9:16 竖屏窗基准，对齐抖音手机预览） */
export const VIDEO_PREVIEW_WIDTH_CLASS = 'w-[240px]';

/**
 * 9:16 竖屏预览窗：宽 240px 固定，高度随比例推导；内部子元素可 absolute 铺满。
 */
export function VideoPreviewFrame({
  children,
  className,
  frameClassName,
  /** 嵌入预览卡片时铺满父级宽（240px 列），不再额外居中套层 */
  embedded = false,
}: {
  children: ReactNode;
  className?: string;
  frameClassName?: string;
  embedded?: boolean;
}) {
  const frame = (
    <div
      className={cn(
        'relative aspect-[9/16] shrink-0 overflow-hidden bg-black',
        embedded ? 'w-full rounded-none' : cn('rounded-lg', VIDEO_PREVIEW_WIDTH_CLASS),
        frameClassName
      )}
    >
      {children}
    </div>
  );

  if (embedded) {
    return frame;
  }

  return <div className={cn('flex justify-center', className)}>{frame}</div>;
}

/**
 * 在 9:16 预览窗内播放视频：object-contain 保留画幅，横/竖/方屏均完整可见。
 */
export function VideoPreviewPlayer({
  src,
  controls = true,
  className,
  videoClassName,
}: {
  src: string;
  controls?: boolean;
  className?: string;
  videoClassName?: string;
}) {
  return (
    <VideoPreviewFrame className={className}>
      <video
        key={src}
        src={src}
        controls={controls}
        playsInline
        preload="metadata"
        className={cn('absolute inset-0 size-full object-contain', videoClassName)}
      />
    </VideoPreviewFrame>
  );
}
