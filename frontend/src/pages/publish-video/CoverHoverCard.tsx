import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** 封面预览槽：点击打开编辑 Dialog（触屏友好，不依赖 hover） */
export function CoverHoverCard({
  label,
  ready,
  src,
  objectFit,
  aspectRatio,
  previewClassName,
  disabled,
  onEdit,
}: {
  label: string;
  ready: boolean;
  src: string | null | undefined;
  objectFit?: 'cover' | 'contain';
  aspectRatio?: number;
  previewClassName?: string;
  disabled?: boolean;
  onEdit: () => void;
}) {
  const hasImage = Boolean(src?.trim());

  return (
    <div className={cn('flex w-fit max-w-full flex-col gap-2', disabled ? 'opacity-60' : null)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {ready ? (
          <Badge variant="secondary" className="font-normal">
            已就绪
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal">
            待生成
          </Badge>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-label={`编辑${label}`}
        className={cn(
          'overflow-hidden rounded-md bg-muted/40 text-left outline-none transition-opacity',
          'focus-visible:ring-2 focus-visible:ring-ring',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-90',
        )}
        onClick={() => {
          onEdit();
        }}
      >
        {hasImage ? (
          <MediaPreviewImage
            src={src}
            alt={`${label} 预览`}
            objectFit={objectFit}
            aspectRatio={aspectRatio}
            className={cn('shrink-0 border-0', previewClassName)}
          />
        ) : (
          <div
            className={cn(
              'flex items-center justify-center bg-muted/60 text-xs text-muted-foreground',
              previewClassName,
            )}
            style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
          >
            点击编辑
          </div>
        )}
      </button>
    </div>
  );
}
