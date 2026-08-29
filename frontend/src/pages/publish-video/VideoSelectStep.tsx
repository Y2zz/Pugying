import type { RefObject } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatBytes } from './helpers';

/** 仅选择器本体：无外层 Card；格式与大小规则写在选择区内 */
export function VideoSelectStep({
  videoSectionRef,
  videoInputRef,
  hasVideo,
  videoFileName,
  videoFileSize,
  dragOver,
  disabled,
  onPickClick,
  onFileChange,
  onContinue,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  videoSectionRef: RefObject<HTMLDivElement | null>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  hasVideo: boolean;
  videoFileName: string;
  videoFileSize: number | null;
  dragOver: boolean;
  disabled: boolean;
  onPickClick: () => void;
  onFileChange: (file: File | null) => void;
  /** 已有视频时返回发布规则（例如点了「更换视频」后又不想换） */
  onContinue?: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div ref={videoSectionRef} className="w-full">
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,.mp4"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {!hasVideo ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'aspect-video min-h-100 w-full flex-col gap-3 border-dashed px-4 py-10 text-center whitespace-normal',
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
            'disabled:opacity-60'
          )}
          onClick={onPickClick}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <Upload className="size-8 text-muted-foreground" />
          <div className="flex max-w-md flex-col gap-1.5">
            <p className="text-sm font-medium">拖入或选择 MP4 视频</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              仅支持 MP4（H.264 + AAC），大小不超过 1GB。上传完成后自动进入发布规则，并生成可裁剪的竖/横封面。
            </p>
          </div>
        </Button>
      ) : (
        <div
          className={cn(
            'flex w-full flex-col gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-6',
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          )}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">视频已就绪</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {videoFileName || '未命名视频'}
                {videoFileSize != null ? ` · ${formatBytes(videoFileSize)}` : ''}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">MP4 · ≤1GB · H.264+AAC · 可继续拖入替换</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {onContinue ? (
                <Button type="button" size="sm" disabled={disabled} onClick={onContinue}>
                  继续设置
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onPickClick}>
                更换视频
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
