/** 从本地视频提取一帧，并按目标比例居中裁剪为 JPEG（供默认封面） */

export type VideoCoverAspect = '3:4' | '16:9';

const ASPECT_RATIO: Record<VideoCoverAspect, number> = {
  '3:4': 3 / 4,
  '16:9': 16 / 9,
};

const OUTPUT_WIDTH: Record<VideoCoverAspect, number> = {
  '3:4': 1080,
  '16:9': 1280,
};

/**
 * 读取本地视频文件，跳到指定时刻截帧，再按比例居中 cover 裁剪。
 */
export async function extractCoverFromVideoFile(
  file: File,
  aspect: VideoCoverAspect = '3:4',
  seekSec = 0.1,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(objectUrl);
    await seekVideoTo(video, seekSec);
    return cropVideoFrameToBlob(video, aspect);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * 一次加载视频，同时导出竖版（3:4）与横版（16:9）封面。
 */
export async function extractCoverPairFromVideoFile(
  file: File,
  seekSec = 0.1,
): Promise<{ portrait: Blob; landscape: Blob }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(objectUrl);
    await seekVideoTo(video, seekSec);
    const portrait = await cropVideoFrameToBlob(video, '3:4');
    const landscape = await cropVideoFrameToBlob(video, '16:9');
    return { portrait, landscape };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function cropVideoFrameToBlob(
  video: HTMLVideoElement,
  aspect: VideoCoverAspect,
): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error('无法读取视频画面尺寸');
  }

  const ratio = ASPECT_RATIO[aspect];
  const { sx, sy, sw, sh } = centerCropRect(vw, vh, ratio);
  const outW = OUTPUT_WIDTH[aspect];
  const outH = Math.round(outW / ratio);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建画布');
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);

  const blob = await canvasToJpeg(canvas);
  if (!blob) {
    throw new Error('封面导出失败');
  }
  return blob;
}

async function seekVideoTo(
  video: HTMLVideoElement,
  seekSec: number,
): Promise<void> {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const target =
    duration > 0
      ? Math.min(Math.max(seekSec, 0), Math.max(duration - 0.05, 0))
      : 0;
  await seekVideo(video, target);
}

/** 源图画幅内按目标比例居中 cover 裁剪矩形 */
export function centerCropRect(
  sourceW: number,
  sourceH: number,
  targetRatio: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sourceRatio = sourceW / sourceH;
  if (sourceRatio > targetRatio) {
    // 源更宽：以高为准，裁左右
    const sw = sourceH * targetRatio;
    const sx = (sourceW - sw) / 2;
    return { sx, sy: 0, sw, sh: sourceH };
  }
  // 源更高或相等：以宽为准，裁上下
  const sh = sourceW / targetRatio;
  const sy = (sourceH - sh) / 2;
  return { sx: 0, sy, sw: sourceW, sh };
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      resolve(video);
    };
    video.onerror = () => {
      reject(new Error('视频加载失败，无法提取封面'));
    };
    video.src = url;
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('视频定位失败'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      video.currentTime = time;
    } catch {
      cleanup();
      // 无法 seek 时用当前帧
      resolve();
    }
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      'image/jpeg',
      0.92,
    );
  });
}
