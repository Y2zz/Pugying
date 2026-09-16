import { Clapperboard, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  describeVideoUploadPhase,
  formatBytes,
  formatRemainingTime,
  formatTransferRate,
  type VideoUploadMetrics,
} from './helpers';

/**
 * 抖音创作者中心风格 9:16 上传占位：上传完成前不渲染视频，仅展示进度与文件信息。
 */
export function VideoUploadPlaceholderPanel({
  fileName,
  fileSize,
  metrics,
  onCancel,
  className,
}: {
  fileName: string;
  fileSize: number | null;
  metrics: VideoUploadMetrics;
  onCancel: () => void;
  className?: string;
}) {
  const displayName = fileName.trim() || '未命名视频';
  const totalBytes = metrics.totalBytes > 0 ? metrics.totalBytes : (fileSize ?? 0);
  const percent =
    metrics.ratio != null ? Math.min(100, Math.max(0, Math.round(metrics.ratio * 100))) : null;
  const loadedLabel = formatBytes(metrics.loadedBytes);
  const totalLabel = totalBytes > 0 ? formatBytes(totalBytes) : '--';
  const speedLabel = formatTransferRate(metrics.speedBps);
  const etaLabel =
    metrics.phase === 'video' && metrics.ratio != null && totalBytes > 0
      ? formatRemainingTime(totalBytes - metrics.loadedBytes, metrics.speedBps)
      : null;
  const phaseLabel = describeVideoUploadPhase(metrics.phase);

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center bg-muted/40 px-5 py-6 text-center',
        className
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        {metrics.phase === 'video' && percent != null ? (
          <Clapperboard className="size-14 text-muted-foreground/55" strokeWidth={1.25} aria-hidden />
        ) : (
          <Loader2 className="size-10 animate-spin text-muted-foreground" aria-hidden />
        )}

        <p className="max-w-full truncate text-sm font-semibold" title={displayName}>
          {displayName}
        </p>

        <p className="text-xs text-destructive">处理过程中请不要删除/移动文件</p>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <div className="flex w-full items-center gap-2">
          <Progress
            value={percent}
            className="min-w-0 flex-1 gap-0 [&_[data-slot=progress-indicator]]:bg-sky-500 [&_[data-slot=progress-track]]:h-1"
          />
          {percent != null ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{percent}%</span>
          ) : (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>

        <div className="space-y-0.5 text-left text-xs text-muted-foreground">
          {metrics.phase === 'video' && metrics.ratio != null ? (
            <>
              <p className="tabular-nums">
                已上传：{loadedLabel}/{totalLabel}
              </p>
              <p className="tabular-nums">当前速度：{speedLabel}</p>
              {etaLabel ? <p>{etaLabel}</p> : null}
            </>
          ) : (
            <p>{phaseLabel}</p>
          )}
        </div>

        <button
          type="button"
          className="py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={onCancel}
        >
          取消上传
        </button>
      </div>
    </div>
  );
}
