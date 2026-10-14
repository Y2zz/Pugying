/**
 * 视频上传进度：分片完成时累加字节并估算速度，供分发队列展示百分比。
 */
import type { VideoUploadProgress } from "./video-api";

export function createUploadMeter(
  totalBytes: number,
  onProgress?: (progress: VideoUploadProgress) => void,
) {
  let lastBytes = 0;
  let lastTime = 0;
  let speedBps = 0;
  let uploaded = 0;

  const emit = (bytes: number) => {
    if (!onProgress) {
      return;
    }
    const now = Date.now();
    if (lastTime > 0 && bytes > lastBytes) {
      const deltaMs = now - lastTime;
      if (deltaMs >= 80) {
        const instant = ((bytes - lastBytes) * 1000) / deltaMs;
        speedBps = speedBps > 0 ? speedBps * 0.65 + instant * 0.35 : instant;
        lastBytes = bytes;
        lastTime = now;
      }
    } else if (lastTime === 0) {
      lastBytes = bytes;
      lastTime = now;
    }
    const percent =
      totalBytes > 0
        ? Math.min(100, Math.floor((bytes / totalBytes) * 100))
        : 0;
    onProgress({
      uploadedBytes: bytes,
      totalBytes,
      percent,
      speedBps,
    });
  };

  return {
    start() {
      emit(0);
    },
    add(bytes: number) {
      uploaded += bytes;
      emit(Math.min(uploaded, totalBytes));
    },
    finish() {
      emit(totalBytes);
    },
  };
}

/** 百分比变化必报；同百分比最多 500ms 刷一次速度。 */
export function throttleVideoUploadProgress(
  notify: (progress: VideoUploadProgress) => void,
): (progress: VideoUploadProgress) => void {
  let lastPercent = -1;
  let lastEmitAt = 0;
  return (progress) => {
    const now = Date.now();
    if (
      progress.percent === lastPercent &&
      progress.percent < 100 &&
      now - lastEmitAt < 500
    ) {
      return;
    }
    lastPercent = progress.percent;
    lastEmitAt = now;
    notify(progress);
  };
}

export function videoUploadProgressFields(progress: VideoUploadProgress): {
  phase: "uploading";
  message: string;
  percent: number;
  uploadedBytes: number;
  totalBytes: number;
  speedBps: number;
} {
  return {
    phase: "uploading",
    message:
      progress.percent >= 100
        ? "视频已上传，等待处理"
        : `上传视频 ${progress.percent}%`,
    percent: progress.percent,
    uploadedBytes: progress.uploadedBytes,
    totalBytes: progress.totalBytes,
    speedBps: progress.speedBps,
  };
}
