import { useRef } from 'react';
import { Crop, ImagePlus } from 'lucide-react';
import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CoverHoverCard({
  label,
  ready,
  src,
  objectFit,
  aspectRatio,
  previewClassName,
  disabled,
  onCrop,
  onReplace,
}: {
  label: string;
  ready: boolean;
  src: string | null | undefined;
  objectFit?: 'cover' | 'contain';
  aspectRatio?: number;
  previewClassName?: string;
  disabled?: boolean;
  onCrop: () => void;
  onReplace: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasImage = Boolean(src?.trim());

  return (
    <div className={cn('group flex flex-col gap-2 rounded-lg border p-2', disabled ? 'opacity-60' : null)}>
      <span className="text-xs text-muted-foreground">
        {label}
        {ready ? '' : ' · 待生成'}
      </span>
      <div className="relative overflow-hidden rounded-md">
        <MediaPreviewImage
          src={src}
          alt={`${label} 预览`}
          objectFit={objectFit}
          aspectRatio={aspectRatio}
          className={cn('shrink-0 border-0', previewClassName)}
        />
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center gap-2 bg-muted/80 opacity-0 backdrop-blur-[1px] transition-opacity',
            disabled ? 'pointer-events-none' : 'group-focus-within:opacity-100 group-hover:opacity-100'
          )}
        >
          <Button type="button" size="sm" variant="secondary" disabled={disabled || !hasImage} onClick={onCrop}>
            <Crop data-icon="inline-start" />
            裁剪
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            <ImagePlus data-icon="inline-start" />
            替换
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (file) {
            onReplace(file);
          }
        }}
      />
    </div>
  );
}
