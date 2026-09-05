import { Loader2 } from 'lucide-react';
import type { MediaDuplicateHit } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  deriveVideoPhonePhase,
  type VideoUploadMetrics,
} from './helpers';
import { VIDEO_PREVIEW_WIDTH_CLASS, VideoPreviewFrame } from './VideoPreviewFrame';
import { VideoPhoneDuplicatePanel } from './VideoPhoneDuplicatePanel';
import { VideoUploadPlaceholderPanel } from './VideoUploadPlaceholderPanel';

/**
 * 表单阶段右栏：240px × 9:16 单柱（校验 / 上传 / 重复 / 就绪）。
 * 首次进入页面的全宽选择器见 {@link VideoInitialUploadSelector}。
 */
export function VideoPhoneColumn({
  hasVideo,
  videoFileName,
  videoFileSize,
  videoPreviewUrl,
  duplicateHit,
  disabled,
  uploading,
  uploadMetrics,
  onPickClick,
  onCancelUpload,
  onDuplicateCancel,
  onDuplicateForceUpload,
  onDuplicateReuse,
}: {
  hasVideo: boolean;
  videoFileName: string;
  videoFileSize: number | null;
  videoPreviewUrl: string | null;
  duplicateHit: MediaDuplicateHit | null;
  disabled: boolean;
  uploading: boolean;
  uploadMetrics: VideoUploadMetrics | null;
  onPickClick: () => void;
  onCancelUpload: () => void;
  onDuplicateCancel: () => void;
  onDuplicateForceUpload: () => void;
  onDuplicateReuse: () => void;
}) {
  const phase = deriveVideoPhonePhase({
    hasVideo,
    videoPreviewUrl,
    duplicateHit,
    uploading,
    uploadMetrics,
  });
  const coverProcessing = uploading && uploadMetrics?.phase === 'cover';
  const showReplaceLink = phase === 'ready' && !uploading;

  return (
    <div
      className={cn(
        'mx-auto flex shrink-0 flex-col items-center gap-2 lg:mx-0 lg:sticky lg:top-4 lg:self-start',
        VIDEO_PREVIEW_WIDTH_CLASS
      )}
    >
      <div
        className={cn(
          'w-full overflow-hidden rounded-xl border shadow-sm',
          phase === 'ready' ? 'bg-black' : 'bg-background'
        )}
      >
        <VideoPreviewFrame embedded frameClassName={phase === 'ready' ? 'bg-black' : 'bg-muted/30'}>
          {phase === 'duplicate' && duplicateHit ? (
            <VideoPhoneDuplicatePanel
              hit={duplicateHit}
              pendingFileName={videoFileName}
              pendingFileSize={videoFileSize}
              disabled={disabled}
              onCancel={onDuplicateCancel}
              onForceUpload={onDuplicateForceUpload}
              onReuse={onDuplicateReuse}
            />
          ) : null}

          {phase === 'checksum' || phase === 'uploading' ? (
            uploadMetrics ? (
              <VideoUploadPlaceholderPanel
                fileName={videoFileName}
                fileSize={videoFileSize}
                metrics={uploadMetrics}
                onCancel={onCancelUpload}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/30">
                <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
                <p className="text-xs text-muted-foreground">准备上传…</p>
              </div>
            )
          ) : null}

          {phase === 'ready' && videoPreviewUrl ? (
            <>
              <video
                key={videoPreviewUrl}
                src={videoPreviewUrl}
                controls={!coverProcessing}
                playsInline
                preload="metadata"
                className="absolute inset-0 size-full object-contain"
              />
              {coverProcessing ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-3 pb-3 pt-8 text-center">
                  <p className="text-xs text-white/90">正在生成竖/横封面…</p>
                </div>
              ) : null}
            </>
          ) : null}

          {phase === 'idle' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/20">
              <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-xs text-muted-foreground">加载视频…</p>
            </div>
          ) : null}
        </VideoPreviewFrame>
      </div>

      {showReplaceLink ? (
        <button
          type="button"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          disabled={disabled}
          onClick={onPickClick}
        >
          更换视频
        </button>
      ) : null}
    </div>
  );
}
