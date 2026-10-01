import { ImagePlus } from 'lucide-react';
import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import type { CoverKind } from '@/lib/api';
import { cn } from '@/lib/utils';
import { COVER_ASPECT_LABEL, COVER_ASPECT_RATIO } from './helpers';

/**
 * 封面缩略图。传 onClick 时是可点的设置入口（空态为虚线占位），否则只做展示（如表格单元格）。
 * 高度由 className 决定，宽度按比例推出，竖横两种比例并排时顶边对齐。
 */
export function ArticleCoverThumb({
  aspect,
  src,
  onClick,
  disabled,
  className,
}: {
  aspect: CoverKind;
  src: string | null | undefined;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const hasImage = Boolean(src?.trim());
  const label = COVER_ASPECT_LABEL[aspect];
  const ratio = COVER_ASPECT_RATIO[aspect];

  const content = hasImage ? (
    <MediaPreviewImage
      src={src}
      alt={label}
      aspectRatio={ratio}
      className="size-full border-0"
    />
  ) : onClick ? (
    <span className="flex size-full items-center justify-center text-muted-foreground">
      <ImagePlus className="size-5" aria-hidden />
    </span>
  ) : null;

  if (!onClick) {
    return (
      <span
        className={cn(
          'block shrink-0 overflow-hidden rounded-md',
          hasImage ? 'bg-muted' : 'border border-dashed border-input',
          className,
        )}
        style={{ aspectRatio: String(ratio) }}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={hasImage ? `更换${label}封面` : `设置${label}封面`}
      className={cn(
        'group/cover relative block shrink-0 overflow-hidden rounded-lg outline-none transition-colors',
        'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        hasImage
          ? 'bg-muted'
          : 'border border-dashed border-input bg-muted/40 hover:border-ring hover:bg-muted',
        className,
      )}
      style={{ aspectRatio: String(ratio) }}
      onClick={onClick}
    >
      {content}
      {hasImage ? (
        <span className="absolute inset-0 flex items-end justify-center bg-linear-to-t from-black/60 to-transparent pb-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover/cover:opacity-100 group-focus-visible/cover:opacity-100">
          更换
        </span>
      ) : null}
    </button>
  );
}
