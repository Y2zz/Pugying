import { VIDEO_ACCEPT, describeVideoUploadPhase, formatBytes } from "./helpers";
import { useState, type RefObject } from "react";
import { Clapperboard, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VideoUploadMetrics } from "./helpers";
import { VideoInitialUploadSelector } from "./VideoInitialUploadSelector";

/** 首次选择视频，选中后显示紧凑素材条，播放器按需打开。 */
export function PublishVideoPreviewPanel({
  videoSectionRef,
  videoInputRef,
  showAssetBar,
  hasVideo,
  videoFileName,
  videoFileSize,
  videoPreviewUrl,
  dragOver,
  disabled,
  uploading,
  uploadMetrics,
  onPickClick,
  onFileChange,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onCancelUpload,
}: {
  videoSectionRef: RefObject<HTMLDivElement | null>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  /** 进入编辑/发布流程后显示素材条。 */
  showAssetBar: boolean;
  hasVideo: boolean;
  videoFileName: string;
  videoFileSize: number | null;
  videoPreviewUrl: string | null;
  dragOver: boolean;
  disabled: boolean;
  uploading: boolean;
  uploadMetrics: VideoUploadMetrics | null;
  onPickClick: () => void;
  onFileChange: (file: File | null) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onCancelUpload: () => void;
}) {
  return (
    <div ref={videoSectionRef} className="w-full">
      <input
        ref={videoInputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {showAssetBar ? (
        <VideoAssetBar
          key={videoPreviewUrl ?? videoFileName}
          hasVideo={hasVideo}
          videoFileName={videoFileName}
          videoFileSize={videoFileSize}
          videoPreviewUrl={videoPreviewUrl}
          disabled={disabled}
          uploading={uploading}
          uploadMetrics={uploadMetrics}
          onPickClick={onPickClick}
          onCancelUpload={onCancelUpload}
        />
      ) : (
        <VideoInitialUploadSelector
          dragOver={dragOver}
          disabled={disabled}
          onPickClick={onPickClick}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />
      )}
    </div>
  );
}

function VideoAssetBar({
  hasVideo,
  videoFileName,
  videoFileSize,
  videoPreviewUrl,
  disabled,
  uploading,
  uploadMetrics,
  onPickClick,
  onCancelUpload,
}: {
  hasVideo: boolean;
  videoFileName: string;
  videoFileSize: number | null;
  videoPreviewUrl: string | null;
  disabled: boolean;
  uploading: boolean;
  uploadMetrics: VideoUploadMetrics | null;
  onPickClick: () => void;
  onCancelUpload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const percent =
    uploadMetrics?.ratio != null
      ? Math.min(100, Math.max(0, Math.round(uploadMetrics.ratio * 100)))
      : null;
  const durationLabel =
    duration !== null
      ? Math.floor(duration / 60) +
        ":" +
        String(Math.floor(duration % 60)).padStart(2, "0")
      : null;
  return (
    <>
      <div
        data-slot="video-asset-bar"
        className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
      >
        <Clapperboard
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={videoFileName}>
            {videoFileName || "视频素材"}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              videoFileSize !== null ? formatBytes(videoFileSize) : null,
              durationLabel,
              uploading
                ? uploadMetrics
                  ? describeVideoUploadPhase(uploadMetrics.phase)
                  : "正在处理…"
                : !hasVideo
                  ? "正在载入…"
                  : null,
              uploading && percent !== null ? percent + "%" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!videoPreviewUrl || uploading}
            onClick={() => {
              setOpen(true);
            }}
          >
            <Play data-icon="inline-start" />
            预览
          </Button>
          {uploading ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelUpload}
            >
              取消处理
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onPickClick}
            >
              <RefreshCw data-icon="inline-start" />
              更换视频
            </Button>
          )}
        </div>
      </div>
      {videoPreviewUrl ? (
        <video
          src={videoPreviewUrl}
          preload="metadata"
          className="hidden"
          aria-hidden
          onLoadedMetadata={(e) => {
            const next = e.currentTarget.duration;
            if (Number.isFinite(next) && next > 0) {
              setDuration(next);
            }
          }}
        />
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>视频预览</DialogTitle>
          </DialogHeader>
          {open && videoPreviewUrl ? (
            <video
              src={videoPreviewUrl}
              controls
              playsInline
              preload="metadata"
              className="max-h-[65dvh] w-full rounded-md bg-black object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
