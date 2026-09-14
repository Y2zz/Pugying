/** 从本地视频提取一帧，并按目标比例居中裁剪为 JPEG（供默认封面） */

export type VideoCoverAspect = '3:4' | '4:3';

const ASPECT_RATIO: Record<VideoCoverAspect, number> = {
  '3:4': 3 / 4,
  '4:3': 4 / 3,
};

const OUTPUT_WIDTH: Record<VideoCoverAspect, number> = {
  '3:4': 1080,
  '4:3': 1280,
};

/** 贴片尾留白，避免 seek 到末尾黑帧 */
export const VIDEO_SEEK_TAIL_PAD_SEC = 0.05;

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
 * 一次加载视频，同时导出竖版（3:4）与横版（4:3）封面。
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
    const landscape = await cropVideoFrameToBlob(video, '4:3');
    return { portrait, landscape };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** 钳制可 seek 时间，避免贴片尾黑帧 */
export function clampVideoSeekTime(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  const max = Math.max(duration - VIDEO_SEEK_TAIL_PAD_SEC, 0);
  return Math.min(Math.max(time, 0), max);
}

/**
 * 极短视频：可用 seek 区间塌缩为单点，选框固定、只出一格缩略图。
 * （duration ≤ pad 时 maxSeek=0）
 */
export function isFilmSeekTrivial(duration: number): boolean {
  return clampVideoSeekTime(Number.POSITIVE_INFINITY, duration) <= 0;
}

/** 胶片选框可拖区间：时间 [0, maxSeek] ↔ 左缘 [0, maxLeft] */
export function filmSelectorRange(
  duration: number,
  trackWidth: number,
  selW: number,
): { maxSeek: number; maxLeft: number } {
  const maxSeek = clampVideoSeekTime(Number.POSITIVE_INFINITY, duration);
  const maxLeft = Math.max(0, trackWidth - Math.max(0, selW));
  return { maxSeek, maxLeft };
}

/** 时刻 → 选框左缘（线性铺满轨道，保证能拖到最右） */
export function timeToFilmSelectorLeft(
  time: number,
  duration: number,
  trackWidth: number,
  selW: number,
): number {
  const { maxSeek, maxLeft } = filmSelectorRange(duration, trackWidth, selW);
  if (maxSeek <= 0 || maxLeft <= 0) {
    return 0;
  }
  const t = clampVideoSeekTime(time, duration);
  return (t / maxSeek) * maxLeft;
}

/** 选框左缘 → 时刻 */
export function filmSelectorLeftToTime(
  left: number,
  duration: number,
  trackWidth: number,
  selW: number,
): number {
  const { maxSeek, maxLeft } = filmSelectorRange(duration, trackWidth, selW);
  if (maxSeek <= 0 || maxLeft <= 0) {
    return 0;
  }
  const clamped = Math.min(maxLeft, Math.max(0, left));
  return clampVideoSeekTime((clamped / maxLeft) * maxSeek, duration);
}

/** 指针在轨道上的 x（相对轨道左）→ 时刻；按选框中心对齐 */
export function filmTrackXToTime(
  xInTrack: number,
  duration: number,
  trackWidth: number,
  selW: number,
): number {
  return filmSelectorLeftToTime(
    xInTrack - selW / 2,
    duration,
    trackWidth,
    selW,
  );
}

/**
 * 胶片格宽度：按封面比例估算格数后均分轨宽（余数分给前几格），
 * 保证末端格完整铺满、不被 overflow 裁切。
 */
export function filmstripCellLayout(
  trackWidthPx: number,
  thumbHeightPx: number,
  coverRatio: number,
  duration: number,
): { count: number; widths: number[] } {
  if (trackWidthPx <= 0 || thumbHeightPx <= 0 || coverRatio <= 0) {
    return { count: 0, widths: [] };
  }
  if (isFilmSeekTrivial(duration)) {
    return { count: 1, widths: [trackWidthPx] };
  }
  const ideal = Math.max(1, Math.round(thumbHeightPx * coverRatio));
  const count = Math.max(1, Math.ceil(trackWidthPx / ideal));
  const base = Math.floor(trackWidthPx / count);
  const rem = trackWidthPx - base * count;
  const widths = Array.from({ length: count }, (_, i) =>
    i < rem ? base + 1 : Math.max(1, base),
  );
  return { count, widths };
}

/** 第 index 格中心相对轨道左缘的 x */
export function filmThumbCellCenterX(index: number, widths: number[]): number {
  let x = 0;
  for (let i = 0; i < index; i += 1) {
    x += widths[i] ?? 0;
  }
  return x + (widths[index] ?? 0) / 2;
}

/**
 * 第 index 格缩略图采样时刻：与选框同一套映射
 * （格中心 = 选框中心时的时间）。
 */
export function filmThumbSampleTime(
  index: number,
  widths: number[],
  duration: number,
  trackWidth: number,
  selW: number,
): number {
  if (isFilmSeekTrivial(duration) || widths.length === 0) {
    return 0;
  }
  return filmTrackXToTime(
    filmThumbCellCenterX(index, widths),
    duration,
    trackWidth,
    selW,
  );
}

/** 胶片时间轴：m:ss（总分可超过 60 分钟） */
export function formatVideoTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 从视频 URL 截取完整一帧 JPEG（不做比例裁切，供编辑封面源图）。
 */
export async function extractFullFrameFromVideoUrl(
  videoUrl: string,
  seekSec = 0.1,
): Promise<Blob> {
  const video = await loadVideo(videoUrl);
  await seekVideoTo(video, seekSec);
  return videoFrameToJpegBlob(video);
}

export type FilmThumbProgress = {
  index: number;
  /** blob: URL，调用方负责在替换/卸载时 revoke */
  url: string;
  /** 本格像素宽（均分轨宽后的结果） */
  cellWidth: number;
  widths: number[];
  count: number;
  duration: number;
};

/**
 * 渐进生成胶片缩略图。
 * 可传入已有 `video`（如 scrub 实例）以避免双开解码；未传则按 videoUrl 自建并在结束时释放。
 * 每格按封面比例裁切；采样时刻与选框 time↔x 映射一致；输出 blob URL。
 */
export async function generateFilmstripThumbnails(
  options: {
    videoUrl?: string;
    /** 复用已有 video 时不在此 dispose（由调用方管理生命周期） */
    video?: HTMLVideoElement;
    trackWidthPx: number;
    thumbHeightPx: number;
    coverRatio: number;
    /** 与悬浮选框同宽，保证取时映射一致 */
    selW: number;
    signal?: AbortSignal;
    onThumb?: (thumb: FilmThumbProgress) => void;
  },
): Promise<{
  duration: number;
  widths: number[];
  count: number;
  urls: string[];
}> {
  const {
    videoUrl,
    video: sharedVideo,
    trackWidthPx,
    thumbHeightPx,
    coverRatio,
    selW,
    signal,
    onThumb,
  } = options;
  if (trackWidthPx <= 0 || thumbHeightPx <= 0 || coverRatio <= 0) {
    return { duration: 0, widths: [], count: 0, urls: [] };
  }

  const ownsVideo = !sharedVideo;
  const video =
    sharedVideo ??
    (videoUrl?.trim()
      ? await loadVideo(videoUrl.trim())
      : null);
  if (!video) {
    throw new Error('缺少视频源');
  }

  try {
    if (signal?.aborted) {
      throw new DOMException('已取消', 'AbortError');
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) {
      throw new Error('无法读取视频时长');
    }

    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const { count, widths } = filmstripCellLayout(
      trackWidthPx,
      thumbHeightPx,
      coverRatio,
      duration,
    );
    if (count <= 0) {
      return { duration, widths: [], count: 0, urls: [] };
    }
    const { sx, sy, sw, sh } = centerCropRect(vw, vh, coverRatio);
    const canvas = document.createElement('canvas');
    canvas.height = thumbHeightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建画布');
    }

    const urls: string[] = [];
    for (let i = 0; i < count; i += 1) {
      // 已通过 onThumb 交付的 URL 由调用方 revoke；中止时勿在此回收，避免已展示格闪断
      if (signal?.aborted) {
        throw new DOMException('已取消', 'AbortError');
      }
      const cellW = widths[i] ?? 1;
      canvas.width = cellW;
      const t = filmThumbSampleTime(i, widths, duration, trackWidthPx, selW);
      await seekVideoTo(video, t);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cellW, thumbHeightPx);
      const blob = await canvasToJpeg(canvas, 0.72);
      if (!blob) {
        throw new Error('缩略图导出失败');
      }
      const url = URL.createObjectURL(blob);
      urls.push(url);
      onThumb?.({
        index: i,
        url,
        cellWidth: cellW,
        widths,
        count,
        duration,
      });
    }
    return { duration, widths, count, urls };
  } finally {
    if (ownsVideo) {
      disposeVideoElement(video);
    }
  }
}

/** 将当前视频帧画到 canvas（实时预览用） */
export function drawVideoFrameToCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    return;
  }
  if (canvas.width !== vw || canvas.height !== vh) {
    canvas.width = vw;
    canvas.height = vh;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.drawImage(video, 0, 0, vw, vh);
}

/**
 * 按目标 CSS 尺寸 cover 绘制视频帧（胶片小选框预览，避免每帧画满分辨率）。
 */
export function drawVideoFrameCoverToCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || cssW <= 0 || cssH <= 0) {
    return;
  }
  const dpr = Math.min(
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    2,
  );
  const outW = Math.max(1, Math.round(cssW * dpr));
  const outH = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== outW || canvas.height !== outH) {
    canvas.width = outW;
    canvas.height = outH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const scale = Math.max(outW / vw, outH / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
}

export async function videoFrameToJpegBlob(
  video: HTMLVideoElement,
  quality = 0.92,
): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error('无法读取视频画面尺寸');
  }
  const canvas = document.createElement('canvas');
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建画布');
  }
  ctx.drawImage(video, 0, 0, vw, vh);
  const blob = await canvasToJpeg(canvas, quality);
  if (!blob) {
    throw new Error('帧导出失败');
  }
  return blob;
}

export function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  return loadVideo(url);
}

/** 释放隐藏 video，避免关窗后仍占解码资源 */
export function disposeVideoElement(
  video: HTMLVideoElement | null | undefined,
): void {
  if (!video) {
    return;
  }
  try {
    video.pause();
  } catch {
    // ignore
  }
  video.removeAttribute('src');
  try {
    video.load();
  } catch {
    // ignore
  }
}

export async function seekVideoElement(
  video: HTMLVideoElement,
  time: number,
): Promise<number> {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const target = clampVideoSeekTime(time, duration);
  await seekVideoTo(video, target);
  // 关键帧吸附后以解码器实际时刻为准，减少「选的」和「看到的」偏差
  return clampVideoSeekTime(video.currentTime, duration);
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
  await seekVideo(video, clampVideoSeekTime(seekSec, duration));
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
    // 跨域签名 URL 需 anonymous，否则 canvas 导出被污染；blob: 不受影响
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    let settled = false;
    const finishOk = () => {
      if (settled) {
        return;
      }
      // 等到可解码且 duration 可用，避免胶片轨 duration=0 导致选框不出现
      const hasSize = video.videoWidth > 0 && video.videoHeight > 0;
      const hasDuration =
        Number.isFinite(video.duration) && video.duration > 0;
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        hasSize &&
        hasDuration
      ) {
        settled = true;
        cleanup();
        resolve(video);
      }
    };
    const finishErr = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', finishOk);
      video.removeEventListener('loadeddata', finishOk);
      video.removeEventListener('canplay', finishOk);
      video.removeEventListener('error', onError);
    };
    const onError = () => {
      finishErr('视频加载失败，无法提取封面');
    };
    // 元数据迟迟不齐时超时失败，避免胶片生成永久挂起
    const timer = setTimeout(() => {
      finishErr('视频加载超时');
    }, 15000);

    video.addEventListener('loadedmetadata', finishOk);
    video.addEventListener('loadeddata', finishOk);
    video.addEventListener('canplay', finishOk);
    video.addEventListener('error', onError);
    video.src = url;
    // 部分浏览器设置 src 后需显式 load
    video.load();
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, time);
    // 已在目标时刻时 seeked 可能不触发，直接用当前帧
    if (
      Math.abs(video.currentTime - target) < 0.001 &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      resolve();
      return;
    }

    let settled = false;
    const onSeeked = () => {
      finish(true);
    };
    const onError = () => {
      finish(false);
    };
    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (ok) {
        resolve();
      } else {
        reject(new Error('视频定位失败'));
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    // 个别编码 seek 卡住时兜底，避免胶片生成永久挂起
    const timer = setTimeout(() => {
      finish(true);
    }, 2500);

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      video.currentTime = target;
    } catch {
      finish(true);
    }
  });
}

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.92,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}
