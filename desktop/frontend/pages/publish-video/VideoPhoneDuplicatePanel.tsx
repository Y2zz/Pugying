import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MediaDuplicateHit } from '@/lib/api';
import { formatBytes } from './helpers';

/**
 * 9:16 柱内重复视频决策（抖音式单柱，不占用柱外第二卡片）。
 */
export function VideoPhoneDuplicatePanel({
  hit,
  pendingFileName,
  pendingFileSize,
  disabled,
  onCancel,
  onForceUpload,
  onReuse,
}: {
  hit: MediaDuplicateHit;
  pendingFileName: string;
  pendingFileSize: number | null;
  disabled?: boolean;
  onCancel: () => void;
  onForceUpload: () => void;
  onReuse: () => void;
}) {
  const displayName = pendingFileName.trim() || '未命名视频';
  const sizeLabel = pendingFileSize != null ? formatBytes(pendingFileSize) : null;

  return (
    <div className="absolute inset-0 flex flex-col bg-amber-500/5 px-4 py-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <Copy className="size-12 text-amber-600" strokeWidth={1.25} aria-hidden />
        <p className="max-w-full truncate text-sm font-semibold" title={displayName}>
          {displayName}
        </p>
        {sizeLabel ? <p className="text-xs text-muted-foreground">{sizeLabel}</p> : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          本机媒体库已有相同视频「{hit.originalName}」。建议直接使用，避免重复占用空间。
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button type="button" size="sm" disabled={disabled} onClick={onReuse}>
          使用已有
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onForceUpload}>
          仍要上传
        </Button>
        <button
          type="button"
          className="py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          disabled={disabled}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  );
}
