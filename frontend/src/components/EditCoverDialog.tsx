import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from '@/components/AppToaster';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import {
  clampOffset,
  cropRectInNatural,
  fitFrame,
  fitViewport,
  offsetToKeepNaturalPointCentered,
  viewportCenterInNatural,
} from '@/lib/cover-crop-geometry';
import { uploadMediaFile } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  clampVideoSeekTime,
  disposeVideoElement,
  drawVideoFrameCoverToCanvas,
  drawVideoFrameToCanvas,
  extractFullFrameFromVideoUrl,
  filmSelectorLeftToTime,
  filmSelectorRange,
  filmTrackXToTime,
  formatVideoTime,
  generateFilmstripThumbnails,
  isFilmSeekTrivial,
  loadVideoElement,
  seekVideoElement,
  timeToFilmSelectorLeft,
  videoFrameToJpegBlob,
} from '@/lib/video-cover';
import { MAX_COVER_UPLOAD_BYTES } from '@/pages/publish-video/helpers';

/** landscape=横版 4:3；portrait=竖版 3:4 */
export type EditCoverAspect = 'landscape' | 'portrait';

const ASPECT_RATIO: Record<EditCoverAspect, number> = {
  landscape: 4 / 3,
  portrait: 3 / 4,
};

const ASPECT_LABEL: Record<EditCoverAspect, string> = {
  landscape: '编辑横版封面（4:3）',
  portrait: '编辑竖版封面（3:4）',
};

const MEDIA_KIND: Record<EditCoverAspect, 'cover' | 'cover_landscape'> = {
  landscape: 'cover_landscape',
  portrait: 'cover',
};

const OUTPUT_WIDTH: Record<EditCoverAspect, number> = {
  landscape: 1280,
  portrait: 1080,
};

const FILMSTRIP_H = 48;
const FRAME_BORDER = '#30eec0';
const WHEEL_ZOOM_STEP = 0.08;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
/** 轨宽变化小于该阈值（或不足约 1/4 格）不触发重生成，避免闪断 */
const TRACK_WIDTH_REGEN_MIN_PX = 8;

/** 舞台当前源图来源（用于胶片区提示） */
type CoverSourceKind = 'upload' | 'video-frame' | null;

export interface EditCoverSavedResult {
  /** 会话内源图（多为 blob:，不入库；供再次打开编辑） */
  sourceUrl: string;
  /** 已上传的裁切封面（媒体库 URL） */
  croppedUrl: string;
  /** 源图来自视频取帧时的时刻；上传或未知则为 null */
  sourceFrameTime: number | null;
}

interface EditCoverDialogProps {
  open: boolean;
  aspect: EditCoverAspect;
  /** 本机/预览视频地址；有则显示胶片取帧 */
  videoUrl?: string | null;
  /** 该比例已有源图；优先加载，否则有视频时截约 0.1s 帧 */
  initialSourceUrl?: string | null;
  /** 与 initialSourceUrl 对应的取帧时刻（会话内恢复胶片选框） */
  initialFrameTime?: number | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: EditCoverSavedResult) => void;
}

/**
 * 短视频「编辑封面」：一次只编一种比例；胶片取帧或上传源图后，
 * 在固定比例框内拖动/缩放构图，确认时仅上传裁切图；源图留在本机会话。
 */
export function EditCoverDialog({
  open,
  aspect,
  videoUrl = null,
  initialSourceUrl = null,
  initialFrameTime = null,
  onOpenChange,
  onSaved,
}: EditCoverDialogProps) {
  const ratio = ASPECT_RATIO[aspect];
  const hasVideo = Boolean(videoUrl?.trim());

  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceObjectUrlRef = useRef<string | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 胶片悬浮选框内的实时/停留帧预览 */
  const filmPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const seekVideoRef = useRef<HTMLVideoElement | null>(null);
  const seekBusyRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const filmDragRef = useRef<{
    /** 按下时指针相对选框左缘的偏移，拖动中保持抓取点 */
    grabOffsetX: number;
  } | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRafRef = useRef(0);
  const pendingTimeRef = useRef<number | null>(null);
  const imageDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const compositionCenterRef = useRef<{ x: number; y: number } | null>(null);
  const stageSizeRef = useRef({ w: 0, h: 0 });

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [livePreview, setLivePreview] = useState(false);

  /** 胶片格 blob: URL；渐进填充，空位为 null */
  const [filmThumbs, setFilmThumbs] = useState<Array<string | null>>([]);
  /** 均分轨宽后的各格像素宽，与生成布局一致 */
  const [filmCellWidths, setFilmCellWidths] = useState<number[]>([]);
  const [filmLoading, setFilmLoading] = useState(false);
  const [filmError, setFilmError] = useState<string | null>(null);
  const [filmRetryNonce, setFilmRetryNonce] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0.1);
  const [trackWidth, setTrackWidth] = useState(0);
  const [sourceKind, setSourceKind] = useState<CoverSourceKind>(null);
  /** 当前源图对应的视频时刻；上传为 null */
  const [sourceFrameTime, setSourceFrameTime] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const currentTimeRef = useRef(0.1);
  const filmThumbUrlsRef = useRef<string[]>([]);
  const trackWidthDebounceRef = useRef(0);
  const committedTrackWidthRef = useRef(0);
  const bootGenRef = useRef(0);
  const freezeGenRef = useRef(0);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const revokeFilmThumbUrls = useCallback((urls: string[]) => {
    for (const url of urls) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
  }, []);

  const clearFilmThumbs = useCallback(() => {
    revokeFilmThumbUrls(filmThumbUrlsRef.current);
    filmThumbUrlsRef.current = [];
    setFilmThumbs([]);
    setFilmCellWidths([]);
  }, [revokeFilmThumbUrls]);

  const revokeSourceObjectUrl = useCallback(() => {
    if (sourceObjectUrlRef.current) {
      URL.revokeObjectURL(sourceObjectUrlRef.current);
      sourceObjectUrlRef.current = null;
    }
  }, []);

  const applySourceUrl = useCallback(
    async (
      url: string,
      isObjectUrl: boolean,
      kind: CoverSourceKind,
      frameTime: number | null = null,
      isStale?: () => boolean,
    ) => {
      // 先解码再切 natural/imageUrl，避免 displayW=0 的空白窗
      try {
        const img = await loadImage(url);
        if (isStale?.()) {
          if (isObjectUrl) {
            URL.revokeObjectURL(url);
          }
          return false;
        }
        const prevObjectUrl = sourceObjectUrlRef.current;
        sourceObjectUrlRef.current = isObjectUrl ? url : null;
        compositionCenterRef.current = {
          x: img.naturalWidth / 2,
          y: img.naturalHeight / 2,
        };
        setScale(1);
        setOffset({ x: 0, y: 0 });
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setImageUrl(url);
        setLivePreview(false);
        setSourceKind(kind);
        setSourceFrameTime(frameTime);
        if (prevObjectUrl && prevObjectUrl !== url) {
          requestAnimationFrame(() => {
            URL.revokeObjectURL(prevObjectUrl);
          });
        }
        return true;
      } catch (err) {
        if (isObjectUrl) {
          URL.revokeObjectURL(url);
        }
        throw err;
      }
    },
    [],
  );

  // 打开时加载源图 / 自动截帧
  useEffect(() => {
    if (!open) {
      bootGenRef.current += 1;
      freezeGenRef.current += 1;
      const reset = setTimeout(() => {
        const scrub = seekVideoRef.current;
        seekVideoRef.current = null;
        disposeVideoElement(scrub);
        revokeSourceObjectUrl();
        setImageUrl(null);
        setNatural({ w: 0, h: 0 });
        setStage({ w: 0, h: 0 });
        stageSizeRef.current = { w: 0, h: 0 };
        setScale(1);
        setOffset({ x: 0, y: 0 });
        clearFilmThumbs();
        setFilmError(null);
        setDuration(0);
        setCurrentTime(0.1);
        setTrackWidth(0);
        setFilmLoading(false);
        setLivePreview(false);
        setOpening(false);
        setSaving(false);
        setSourceKind(null);
        setSourceFrameTime(null);
        compositionCenterRef.current = null;
        committedTrackWidthRef.current = 0;
      }, 0);
      return () => {
        clearTimeout(reset);
      };
    }

    const bootGen = ++bootGenRef.current;
    const isStale = () => bootGen !== bootGenRef.current;
    const boot = async () => {
      setOpening(true);
      try {
        const initial = initialSourceUrl?.trim() || null;
        if (initial) {
          const frameTime =
            initialFrameTime != null && Number.isFinite(initialFrameTime)
              ? Math.max(0, initialFrameTime)
              : null;
          const applied = await applySourceUrl(
            initial,
            false,
            null,
            frameTime,
            isStale,
          );
          if (!applied || isStale()) {
            return;
          }
          if (frameTime != null) {
            setCurrentTime(frameTime);
            currentTimeRef.current = frameTime;
          }
          return;
        }
        const video = videoUrl?.trim() || null;
        if (video) {
          const blob = await extractFullFrameFromVideoUrl(video, 0.1);
          if (isStale()) {
            return;
          }
          const url = URL.createObjectURL(blob);
          const applied = await applySourceUrl(
            url,
            true,
            'video-frame',
            0.1,
            isStale,
          );
          if (!applied || isStale()) {
            return;
          }
          setCurrentTime(0.1);
          currentTimeRef.current = 0.1;
          return;
        }
        if (!isStale()) {
          setImageUrl(null);
        }
      } catch (err) {
        if (!isStale()) {
          toast.add({
            type: 'error',
            title: '打开封面编辑失败',
            description: err instanceof Error ? err.message : '未知错误',
          });
          onOpenChange(false);
        }
      } finally {
        if (!isStale()) {
          setOpening(false);
        }
      }
    };
    void boot();
  }, [
    open,
    initialSourceUrl,
    initialFrameTime,
    videoUrl,
    applySourceUrl,
    onOpenChange,
    revokeSourceObjectUrl,
    clearFilmThumbs,
  ]);

  useEffect(() => {
    return () => {
      const scrub = seekVideoRef.current;
      seekVideoRef.current = null;
      disposeVideoElement(scrub);
      revokeSourceObjectUrl();
    };
  }, [revokeSourceObjectUrl]);

  // 台面尺寸
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    // 关闭重置会把 stage 清零但若 ref 残留上次宽高，同尺寸会被 sync 跳过 → 二次打开 viewport=0 空白
    stageSizeRef.current = { w: 0, h: 0 };
    let observer: ResizeObserver | null = null;
    let raf = 0;
    let tries = 0;
    const sync = () => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const next = { w: rect.width, h: rect.height };
      const prev = stageSizeRef.current;
      if (prev.w === next.w && prev.h === next.h) {
        return;
      }
      stageSizeRef.current = next;
      setStage(next);
    };
    const measure = () => {
      const el = stageRef.current;
      if (!el) {
        if (tries < 20) {
          tries += 1;
          raf = requestAnimationFrame(measure);
        }
        return;
      }
      sync();
      if (!observer) {
        observer = new ResizeObserver(sync);
        observer.observe(el);
      }
    };
    measure();
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [open]);

  // 胶片轨宽度：用 clientWidth；防抖 + 阈值，避免微调触发整轨重生成闪断
  useLayoutEffect(() => {
    if (!open || !hasVideo) {
      return;
    }
    let observer: ResizeObserver | null = null;
    let raf = 0;
    let tries = 0;
    let reopenTimer = 0;

    const commitWidth = (w: number, force: boolean) => {
      if (w <= 0) {
        return false;
      }
      const prev = committedTrackWidthRef.current;
      const minDelta = Math.max(
        TRACK_WIDTH_REGEN_MIN_PX,
        Math.round(FILMSTRIP_H * ratio * 0.25),
      );
      if (!force && prev > 0 && Math.abs(w - prev) < minDelta) {
        return true;
      }
      committedTrackWidthRef.current = w;
      setTrackWidth(w);
      return true;
    };

    const readWidth = () => trackRef.current?.clientWidth ?? 0;

    const scheduleCommit = (w: number, force: boolean) => {
      if (force || committedTrackWidthRef.current <= 0) {
        commitWidth(w, true);
        return;
      }
      window.clearTimeout(trackWidthDebounceRef.current);
      trackWidthDebounceRef.current = window.setTimeout(() => {
        commitWidth(w, false);
      }, 160);
    };

    const sync = (force = false) => {
      const w = readWidth();
      if (w <= 0) {
        return false;
      }
      scheduleCommit(w, force);
      return true;
    };

    const measure = () => {
      const el = trackRef.current;
      if (!el) {
        if (tries < 40) {
          tries += 1;
          raf = requestAnimationFrame(measure);
        }
        return;
      }
      if (!sync(committedTrackWidthRef.current <= 0) && tries < 40) {
        tries += 1;
        raf = requestAnimationFrame(measure);
        return;
      }
      if (!observer) {
        observer = new ResizeObserver(() => {
          sync(false);
        });
        observer.observe(el);
      }
    };
    setFilmLoading(true);
    measure();
    reopenTimer = window.setTimeout(() => {
      sync(false);
    }, 220);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(reopenTimer);
      window.clearTimeout(trackWidthDebounceRef.current);
      observer?.disconnect();
    };
  }, [open, hasVideo, ratio]);

  // 渐进生成胶片：独立 video；blob URL；失败可重试；轨宽未过阈值不重跑
  useEffect(() => {
    if (!open || !hasVideo || !videoUrl?.trim() || trackWidth <= 0) {
      return;
    }
    const abort = new AbortController();
    let cancelled = false;
    const selWPx = Math.min(
      trackWidth,
      Math.max(12, Math.round(FILMSTRIP_H * ratio)),
    );

    setFilmLoading(true);
    setFilmError(null);

    // 复用同一 scrub video 生成胶片，避免双开解码
    void (async () => {
      let scrubVideo: HTMLVideoElement | null = null;
      try {
        scrubVideo = await loadVideoElement(videoUrl.trim());
        if (cancelled || abort.signal.aborted) {
          disposeVideoElement(scrubVideo);
          return;
        }
        seekVideoRef.current = scrubVideo;
        const dur = Number.isFinite(scrubVideo.duration) ? scrubVideo.duration : 0;
        setDuration(dur);
        const stayAt = isFilmSeekTrivial(dur)
          ? 0
          : clampVideoSeekTime(currentTimeRef.current, dur);
        setCurrentTime(stayAt);
        currentTimeRef.current = stayAt;
        const actualStay = await seekVideoElement(scrubVideo, stayAt);
        if (cancelled) {
          return;
        }
        setCurrentTime(actualStay);
        currentTimeRef.current = actualStay;
        requestAnimationFrame(() => {
          if (cancelled || !seekVideoRef.current) {
            return;
          }
          const filmCanvas = filmPreviewCanvasRef.current;
          if (filmCanvas) {
            drawVideoFrameCoverToCanvas(
              seekVideoRef.current,
              filmCanvas,
              filmCanvas.clientWidth || FILMSTRIP_H,
              filmCanvas.clientHeight || FILMSTRIP_H,
            );
          }
        });

        const staleUrls = filmThumbUrlsRef.current;
        let replaced = false;

        const { duration: thumbDur, widths } = await generateFilmstripThumbnails({
          video: scrubVideo,
          trackWidthPx: trackWidth,
          thumbHeightPx: FILMSTRIP_H,
          coverRatio: ratio,
          selW: selWPx,
          signal: abort.signal,
          onThumb: (thumb) => {
            if (cancelled) {
              URL.revokeObjectURL(thumb.url);
              return;
            }
            if (!replaced) {
              revokeFilmThumbUrls(staleUrls);
              filmThumbUrlsRef.current = [];
              replaced = true;
              setFilmCellWidths(thumb.widths);
              setFilmThumbs(Array.from({ length: thumb.count }, () => null));
            }
            filmThumbUrlsRef.current[thumb.index] = thumb.url;
            setDuration(thumb.duration);
            setFilmThumbs((prev) => {
              const next =
                prev.length === thumb.count
                  ? [...prev]
                  : Array.from({ length: thumb.count }, () => null);
              next[thumb.index] = thumb.url;
              return next;
            });
          },
        });

        if (cancelled) {
          return;
        }
        setFilmCellWidths(widths);
        if (thumbDur > 0) {
          setDuration(thumbDur);
        }
        const finalAt = isFilmSeekTrivial(thumbDur || dur)
          ? 0
          : clampVideoSeekTime(currentTimeRef.current, thumbDur || dur);
        const actualFinal = await seekVideoElement(scrubVideo, finalAt);
        if (!cancelled) {
          setCurrentTime(actualFinal);
          currentTimeRef.current = actualFinal;
        }
        if (!cancelled && seekVideoRef.current) {
          requestAnimationFrame(() => {
            const filmCanvas = filmPreviewCanvasRef.current;
            if (filmCanvas && seekVideoRef.current) {
              drawVideoFrameCoverToCanvas(
                seekVideoRef.current,
                filmCanvas,
                filmCanvas.clientWidth || FILMSTRIP_H,
                filmCanvas.clientHeight || FILMSTRIP_H,
              );
            }
          });
        }
      } catch (err) {
        if (abort.signal.aborted || cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : '未知错误';
        setFilmError(message);
        toast.add({
          type: 'error',
          title: '生成缩略图失败',
          description: message,
        });
      } finally {
        if (!cancelled) {
          setFilmLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      const scrub = seekVideoRef.current;
      seekVideoRef.current = null;
      disposeVideoElement(scrub);
    };
  }, [
    open,
    hasVideo,
    videoUrl,
    trackWidth,
    ratio,
    filmRetryNonce,
    revokeFilmThumbUrls,
  ]);

  const viewport = fitViewport(stage.w, stage.h, ratio);
  const frame = fitFrame(natural.w, natural.h, viewport.w, viewport.h, scale);

  // 舞台尺寸变化时保持构图中心；缩放时亦同
  useEffect(() => {
    if (!frame.displayW || !viewport.w || !natural.w) {
      return;
    }
    const center =
      compositionCenterRef.current ??
      viewportCenterInNatural({
        offset,
        displayW: frame.displayW,
        displayH: frame.displayH,
        vw: viewport.w,
        vh: viewport.h,
        naturalW: natural.w,
        naturalH: natural.h,
      });
    compositionCenterRef.current = center;
    const next = offsetToKeepNaturalPointCentered({
      naturalX: center.x,
      naturalY: center.y,
      displayW: frame.displayW,
      displayH: frame.displayH,
      vw: viewport.w,
      vh: viewport.h,
      naturalW: natural.w,
      naturalH: natural.h,
    });
    const apply = setTimeout(() => {
      setOffset((prev) =>
        prev.x === next.x && prev.y === next.y ? prev : next,
      );
    }, 0);
    return () => {
      clearTimeout(apply);
    };
    // 刻意不把 offset 列入依赖：由 scale / stage / natural 驱动重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    frame.displayW,
    frame.displayH,
    viewport.w,
    viewport.h,
    scale,
    natural.w,
    natural.h,
  ]);

  const setScaleKeepingCenter = (nextScale: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
    if (!natural.w || !viewport.w) {
      setScale(clamped);
      return;
    }
    const center =
      compositionCenterRef.current ??
      viewportCenterInNatural({
        offset,
        displayW: frame.displayW,
        displayH: frame.displayH,
        vw: viewport.w,
        vh: viewport.h,
        naturalW: natural.w,
        naturalH: natural.h,
      });
    compositionCenterRef.current = center;
    setScale(clamped);
  };

  const onStageWheel = (event: React.WheelEvent) => {
    if (!natural.w) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
    setScaleKeepingCenter(scale + delta);
  };

  const onImagePointerDown = (event: React.PointerEvent) => {
    if (!natural.w || livePreview) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setGrabbing(true);
    imageDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const onImagePointerMove = (event: React.PointerEvent) => {
    if (!imageDragRef.current || !frame.displayW) {
      return;
    }
    const dx = event.clientX - imageDragRef.current.startX;
    const dy = event.clientY - imageDragRef.current.startY;
    const next = clampOffset(
      {
        x: imageDragRef.current.originX + dx,
        y: imageDragRef.current.originY + dy,
      },
      frame.displayW,
      frame.displayH,
      viewport.w,
      viewport.h,
    );
    setOffset(next);
    compositionCenterRef.current = viewportCenterInNatural({
      offset: next,
      displayW: frame.displayW,
      displayH: frame.displayH,
      vw: viewport.w,
      vh: viewport.h,
      naturalW: natural.w,
      naturalH: natural.h,
    });
  };

  const onImagePointerUp = () => {
    imageDragRef.current = null;
    setGrabbing(false);
  };

  const paintSeekPreview = useCallback((video: HTMLVideoElement) => {
    const stageCanvas = liveCanvasRef.current;
    if (stageCanvas) {
      // 画满帧；CSS 尺寸/位移与静图一致，从而带上当前缩放与平移
      drawVideoFrameToCanvas(video, stageCanvas);
    }
    const filmCanvas = filmPreviewCanvasRef.current;
    if (filmCanvas) {
      const cssW = filmCanvas.clientWidth || FILMSTRIP_H;
      const cssH = filmCanvas.clientHeight || FILMSTRIP_H;
      drawVideoFrameCoverToCanvas(video, filmCanvas, cssW, cssH);
    }
  }, []);

  // live 一挂上就画当前帧，避免空 canvas 盖住静图前的空白窗
  useLayoutEffect(() => {
    if (!livePreview) {
      return;
    }
    const video = seekVideoRef.current;
    if (!video) {
      return;
    }
    paintSeekPreview(video);
  }, [livePreview, paintSeekPreview]);

  const runSeek = useCallback(
    async (time: number) => {
      const video = seekVideoRef.current;
      if (!video) {
        return time;
      }
      if (seekBusyRef.current) {
        pendingSeekRef.current = time;
        return time;
      }
      seekBusyRef.current = true;
      let lastActual = time;
      try {
        let target: number | null = time;
        while (target !== null) {
          lastActual = await seekVideoElement(video, target);
          paintSeekPreview(video);
          target = pendingSeekRef.current;
          pendingSeekRef.current = null;
        }
      } finally {
        seekBusyRef.current = false;
      }
      return lastActual;
    },
    [paintSeekPreview],
  );

  /** 等到指定时刻 seek 完成（含合并队列），返回解码器实际时刻 */
  const flushSeek = useCallback(
    async (time: number) => {
      const video = seekVideoRef.current;
      if (!video) {
        return time;
      }
      pendingSeekRef.current = time;
      if (!seekBusyRef.current) {
        return runSeek(time);
      }
      let spins = 0;
      while (seekBusyRef.current && spins < 180) {
        await new Promise<void>((resolve) => {
          window.setTimeout(() => {
            resolve();
          }, 16);
        });
        spins += 1;
      }
      // 队列未吃到最终时刻时补一次
      if (Math.abs(video.currentTime - time) > 0.05) {
        return runSeek(time);
      }
      return clampVideoSeekTime(video.currentTime, video.duration || 0);
    },
    [runSeek],
  );

  const freezeLiveFrame = useCallback(async () => {
    const video = seekVideoRef.current;
    if (!video) {
      setLivePreview(false);
      return;
    }
    const freezeGen = ++freezeGenRef.current;
    try {
      const stayAt = currentTimeRef.current;
      const actualAt = await flushSeek(stayAt);
      if (freezeGen !== freezeGenRef.current) {
        return;
      }
      // 以关键帧吸附后的实际时刻为准，更新选框与固化时间
      currentTimeRef.current = actualAt;
      setCurrentTime(actualAt);
      if (selectorRef.current && duration > 0) {
        const trackW = trackRef.current?.clientWidth || trackWidth;
        const selWPx = Math.min(
          trackW,
          Math.max(12, Math.round(FILMSTRIP_H * ratio)),
        );
        selectorRef.current.style.left = `${timeToFilmSelectorLeft(
          actualAt,
          duration,
          trackW,
          selWPx,
        )}px`;
      }

      const blob = await videoFrameToJpegBlob(video);
      if (freezeGen !== freezeGenRef.current) {
        return;
      }
      const url = URL.createObjectURL(blob);
      // 先预加载，再切换；旧 blob 延后 revoke，避免裁剪区闪断
      const img = await loadImage(url);
      if (freezeGen !== freezeGenRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const prevObjectUrl = sourceObjectUrlRef.current;
      sourceObjectUrlRef.current = url;
      const sameNatural =
        img.naturalWidth === natural.w && img.naturalHeight === natural.h;
      // 同尺寸视频帧保留缩放/平移，避免松手后构图跳回中心
      if (!sameNatural) {
        compositionCenterRef.current = {
          x: img.naturalWidth / 2,
          y: img.naturalHeight / 2,
        };
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setImageUrl(url);
      setSourceKind('video-frame');
      setSourceFrameTime(actualAt);
      setLivePreview(false);
      if (prevObjectUrl && prevObjectUrl !== url) {
        requestAnimationFrame(() => {
          URL.revokeObjectURL(prevObjectUrl);
        });
      }
    } catch (err) {
      if (freezeGen !== freezeGenRef.current) {
        return;
      }
      toast.add({
        type: 'error',
        title: '打开封面编辑失败',
        description: err instanceof Error ? err.message : '截帧失败',
      });
      // 失败时回到上一张静态图（若有）
      setLivePreview(false);
    }
  }, [flushSeek, duration, trackWidth, ratio, natural.w, natural.h]);

  const selW =
    duration > 0 && trackWidth > 0
      ? Math.min(trackWidth, Math.max(12, FILMSTRIP_H * ratio))
      : FILMSTRIP_H * ratio;
  const filmTrivial = isFilmSeekTrivial(duration);
  // 时间与选框左缘线性映射，保证能拖到轨道最右（对应可用片尾）
  const selLeft =
    duration > 0 && trackWidth > 0
      ? timeToFilmSelectorLeft(currentTime, duration, trackWidth, selW)
      : 0;

  const scheduleCurrentTime = useCallback((time: number) => {
    currentTimeRef.current = time;
    pendingTimeRef.current = time;
    if (timeLabelRafRef.current) {
      return;
    }
    // 每帧最多 setState 一次，避免 pointermove 拖垮整页重渲
    timeLabelRafRef.current = requestAnimationFrame(() => {
      timeLabelRafRef.current = 0;
      const next = pendingTimeRef.current;
      if (next != null) {
        setCurrentTime(next);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timeLabelRafRef.current) {
        cancelAnimationFrame(timeLabelRafRef.current);
      }
    };
  }, []);

  const applyFilmTime = useCallback(
    (
      time: number,
      selWPx: number,
      trackW: number,
      dur: number,
      visualLeft?: number,
    ) => {
      const clamped = clampVideoSeekTime(time, dur);
      const left =
        visualLeft ?? timeToFilmSelectorLeft(clamped, dur, trackW, selWPx);
      // 拖动中直接改 DOM，选框位置不跟 React 渲染抢帧
      if (selectorRef.current) {
        selectorRef.current.style.left = `${left}px`;
      }
      scheduleCurrentTime(clamped);
      void runSeek(clamped);
    },
    [runSeek, scheduleCurrentTime],
  );

  /** 拖动/点击时用实时布局宽，避免与 state 轨宽短暂不一致 */
  const liveTrackWidth = () => {
    const w = trackRef.current?.clientWidth ?? 0;
    return w > 0 ? w : trackWidth;
  };

  const timeFromTrackX = (clientX: number, selWPx: number) => {
    const el = trackRef.current;
    const trackW = liveTrackWidth();
    if (!el || duration <= 0 || trackW <= 0) {
      return 0;
    }
    const rect = el.getBoundingClientRect();
    const visualW = rect.width || trackW;
    const xLayout =
      visualW > 0 ? ((clientX - rect.left) / visualW) * trackW : clientX - rect.left;
    return filmTrackXToTime(xLayout, duration, trackW, selWPx);
  };

  const beginFilmInteraction = (time: number, selWPx: number) => {
    if (filmTrivial) {
      applyFilmTime(0, selWPx, liveTrackWidth(), duration);
      setLivePreview(true);
      return;
    }
    setLivePreview(true);
    const trackW = liveTrackWidth();
    requestAnimationFrame(() => {
      applyFilmTime(time, selWPx, trackW, duration);
    });
  };

  const onFilmPointerDown = (event: React.PointerEvent) => {
    const trackW = liveTrackWidth();
    if (!duration || trackW <= 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (filmTrivial) {
      filmDragRef.current = { grabOffsetX: 0 };
      beginFilmInteraction(0, selW);
      return;
    }
    const rect = trackRef.current?.getBoundingClientRect();
    const currentLeft = timeToFilmSelectorLeft(
      currentTimeRef.current,
      duration,
      trackW,
      selW,
    );
    const visualW = rect?.width || trackW;
    const scale = visualW > 0 ? trackW / visualW : 1;
    filmDragRef.current = {
      grabOffsetX: rect
        ? (event.clientX - rect.left) * scale - currentLeft
        : selW / 2,
    };
    beginFilmInteraction(currentTimeRef.current, selW);
  };

  const onFilmPointerMove = (event: React.PointerEvent) => {
    const trackW = liveTrackWidth();
    if (!filmDragRef.current || !duration || trackW <= 0 || filmTrivial) {
      return;
    }
    const el = trackRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const visualW = rect.width || trackW;
    const scale = visualW > 0 ? trackW / visualW : 1;
    const rawLeft =
      (event.clientX - rect.left) * scale - filmDragRef.current.grabOffsetX;
    const { maxLeft } = filmSelectorRange(duration, trackW, selW);
    // 硬钳制在轨道内，不允许拖出边界
    const clampedLeft = Math.min(maxLeft, Math.max(0, rawLeft));
    const next = filmSelectorLeftToTime(clampedLeft, duration, trackW, selW);
    applyFilmTime(next, selW, trackW, duration, clampedLeft);
  };

  const onFilmPointerUp = () => {
    if (!filmDragRef.current) {
      return;
    }
    filmDragRef.current = null;
    const trackW = liveTrackWidth();
    applyFilmTime(currentTimeRef.current, selW, trackW, duration);
    void freezeLiveFrame();
  };

  const onTrackClick = (event: React.MouseEvent) => {
    if (filmDragRef.current) {
      return;
    }
    if (!duration || liveTrackWidth() <= 0) {
      return;
    }
    const time = filmTrivial ? 0 : timeFromTrackX(event.clientX, selW);
    const trackW = liveTrackWidth();
    // 点轨不切 livePreview，避免裁剪区先变空 canvas 再闪回
    applyFilmTime(time, selW, trackW, duration);
    void (async () => {
      await flushSeek(time);
      await freezeLiveFrame();
    })();
  };

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.add({
        type: 'error',
        title: '请选择图片文件',
      });
      return;
    }
    if (file.size > MAX_COVER_UPLOAD_BYTES) {
      toast.add({
        type: 'error',
        title: '图片过大',
        description: `请选择不超过 ${Math.round(MAX_COVER_UPLOAD_BYTES / (1024 * 1024))}MB 的图片`,
      });
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      void applySourceUrl(url, true, 'upload', null).catch(() => {
        toast.add({
          type: 'error',
          title: '替换失败',
        });
      });
    } catch {
      toast.add({
        type: 'error',
        title: '替换失败',
      });
    }
  };

  const ready =
    !opening &&
    !livePreview &&
    Boolean(imageUrl && natural.w > 0 && frame.displayW > 0 && viewport.w > 0);

  const confirm = async () => {
    if (!ready || !imageUrl || saving) {
      return;
    }
    setSaving(true);
    try {
      const croppedBlob = await exportCroppedJpeg({
        imageUrl,
        aspect,
        ratio,
        offset,
        displayW: frame.displayW,
        displayH: frame.displayH,
        vw: viewport.w,
        vh: viewport.h,
        naturalW: natural.w,
        naturalH: natural.h,
      });
      const stamp = Date.now();
      const kind = MEDIA_KIND[aspect];
      const croppedFile = new File(
        [croppedBlob],
        `cover-${aspect}-${stamp}.jpg`,
        { type: 'image/jpeg' },
      );
      // 只上传裁切图；源图以会话 URL 交还给父级，不进媒体库
      const croppedAsset = await uploadMediaFile(croppedFile, kind);
      // 本对话框创建的 blob 移交父级，避免关闭时 revoke
      if (sourceObjectUrlRef.current === imageUrl) {
        sourceObjectUrlRef.current = null;
      }
      onSaved({
        sourceUrl: imageUrl,
        croppedUrl: croppedAsset.url,
        // 上传覆盖帧时刻；取帧或重开恢复的时刻予以保留
        sourceFrameTime: sourceKind === 'upload' ? null : sourceFrameTime,
      });
      onOpenChange(false);
    } catch (err) {
      toast.add({
        type: 'error',
        title: '保存封面失败',
        description: err instanceof Error ? err.message : '未知错误',
      });
    } finally {
      setSaving(false);
    }
  };

  const description = hasVideo
    ? filmTrivial
      ? '视频极短，仅一帧可选；可在画面中拖动/缩放构图，也可上传图片。'
      : '拖动白色选框在胶片上取帧，在画面中拖动/缩放构图；也可上传图片。松手后选框会对齐实际解码时刻。'
    : '在画面中拖动/缩放构图；也可上传图片。';

  const sourceHint =
    sourceKind === 'upload'
      ? hasVideo
        ? '当前画面来自上传；拖动胶片可改回视频帧'
        : '当前画面来自上传'
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{ASPECT_LABEL[aspect]}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div
          ref={stageRef}
          className="relative w-full overflow-hidden rounded-md bg-muted/40"
          style={{ height: 'min(52vh, 380px)' }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                'relative touch-none overflow-hidden select-none',
                ready ? (grabbing ? 'cursor-grabbing' : 'cursor-grab') : null,
              )}
              style={{
                width: viewport.w || '100%',
                height: viewport.h || '100%',
              }}
              onPointerDown={onImagePointerDown}
              onPointerMove={onImagePointerMove}
              onPointerUp={onImagePointerUp}
              onPointerCancel={onImagePointerUp}
              onWheel={onStageWheel}
            >
              {/* 静图始终可见；live canvas 与静图同几何叠在上方，保留缩放/平移 */}
              {imageUrl && natural.w > 0 ? (
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
                  style={{
                    width: frame.displayW,
                    height: frame.displayH,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }}
                />
              ) : null}
              {livePreview ? (
                <canvas
                  ref={liveCanvasRef}
                  className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
                  style={{
                    width: frame.displayW || '100%',
                    height: frame.displayH || '100%',
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }}
                />
              ) : null}
              {!livePreview && !(imageUrl && natural.w > 0) ? (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  {opening || imageUrl ? '加载中…' : '暂无画面'}
                </div>
              ) : null}

              {/* 取景框线 + 外侧半透明遮罩（四边 inset 阴影） */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow: `0 0 0 9999px rgba(0,0,0,0.45)`,
                  border: `2px solid ${FRAME_BORDER}`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ZoomOut className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Slider
            className="min-w-0 flex-1"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={[scale]}
            disabled={!ready}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (typeof next === 'number') {
                setScaleKeepingCenter(next);
              }
            }}
          />
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
        </div>

        <div className="flex items-start gap-3 py-1">
          {hasVideo ? (
            <div className="min-w-0 flex-1">
              {/*
                trackRef 只量缩略图轨宽；选框作为兄弟节点悬浮在轨上。
              */}
              <div
                ref={trackRef}
                className="relative w-full"
                style={{ height: FILMSTRIP_H }}
              >
                <div
                  className="absolute inset-0 overflow-hidden rounded-md bg-zinc-900"
                  onClick={onTrackClick}
                >
                  {filmError && filmThumbs.every((t) => !t) ? (
                    <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-zinc-400">
                      <span>缩略图生成失败</span>
                      <button
                        type="button"
                        className="underline hover:text-zinc-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilmRetryNonce((n) => n + 1);
                        }}
                      >
                        重试
                      </button>
                    </div>
                  ) : filmLoading && filmThumbs.every((t) => !t) ? (
                    <div className="flex size-full items-center justify-center text-xs text-zinc-400">
                      生成缩略图…
                    </div>
                  ) : filmThumbs.length > 0 ? (
                    <div className="flex h-full w-full">
                      {filmThumbs.map((src, index) => {
                        const cellW =
                          filmCellWidths[index] ??
                          Math.max(1, Math.round(FILMSTRIP_H * ratio));
                        return src ? (
                          <img
                            key={`${index}-${src.slice(-24)}`}
                            src={src}
                            alt=""
                            draggable={false}
                            className="h-full shrink-0 object-cover"
                            style={{ width: cellW }}
                          />
                        ) : (
                          <div
                            key={`pending-${index}`}
                            className="h-full shrink-0 animate-pulse bg-zinc-800"
                            style={{ width: cellW }}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-zinc-500">
                      {trackWidth <= 0 ? '准备轨道…' : '暂无缩略图'}
                    </div>
                  )}
                </div>

                {duration > 0 ? (
                  <div
                    ref={selectorRef}
                    className={cn(
                      'absolute z-20 touch-none will-change-[left]',
                      filmTrivial
                        ? 'cursor-default'
                        : 'cursor-grab active:cursor-grabbing',
                    )}
                    style={{
                      left: selLeft,
                      top: -4,
                      width: selW,
                      height: FILMSTRIP_H + 8,
                    }}
                    onPointerDown={onFilmPointerDown}
                    onPointerMove={onFilmPointerMove}
                    onPointerUp={onFilmPointerUp}
                    onPointerCancel={onFilmPointerUp}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <div
                      className="absolute inset-0 overflow-hidden rounded-sm shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
                      style={{
                        border: '3px solid #fff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <canvas
                        ref={filmPreviewCanvasRef}
                        className="pointer-events-none absolute inset-0 size-full"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/35 to-transparent pb-0.5 pt-2 text-white">
                        <ChevronLeft className="size-3.5 -mr-0.5 drop-shadow" aria-hidden />
                        <ChevronRight className="size-3.5 -ml-0.5 drop-shadow" aria-hidden />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>{formatVideoTime(currentTime)}</span>
                <span>{formatVideoTime(duration)}</span>
              </div>
              {sourceHint ? (
                <p className="mt-1 text-xs text-muted-foreground">{sourceHint}</p>
              ) : null}
              {filmTrivial ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  视频过短，胶片仅保留起始帧
                </p>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <div
                className="flex min-w-0 flex-1 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground"
                style={{ height: FILMSTRIP_H }}
              >
                当前无视频预览，请上传封面图。
              </div>
              {sourceHint ? (
                <p className="mt-2 text-xs text-muted-foreground">{sourceHint}</p>
              ) : null}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="flex shrink-0 flex-col gap-0 px-1 text-[10px] leading-tight"
            style={{ height: FILMSTRIP_H, width: FILMSTRIP_H }}
            disabled={saving}
            onClick={onUploadClick}
          >
            <Plus className="size-3.5" />
            <span>上传封面</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            取消
          </Button>
          <Button disabled={!ready || saving} onClick={() => void confirm()}>
            {saving ? '保存中…' : '完成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function exportCroppedJpeg(params: {
  imageUrl: string;
  aspect: EditCoverAspect;
  ratio: number;
  offset: { x: number; y: number };
  displayW: number;
  displayH: number;
  vw: number;
  vh: number;
  naturalW: number;
  naturalH: number;
}): Promise<Blob> {
  const {
    imageUrl,
    aspect,
    ratio,
    offset,
    displayW,
    displayH,
    vw,
    vh,
    naturalW,
    naturalH,
  } = params;
  const outW = OUTPUT_WIDTH[aspect];
  const outH = Math.round(outW / ratio);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建画布');
  }
  const img = await loadImage(imageUrl);
  const { sx, sy, sw, sh } = cropRectInNatural({
    offset,
    displayW,
    displayH,
    vw,
    vh,
    naturalW,
    naturalH,
  });
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (b) => {
        resolve(b);
      },
      'image/jpeg',
      0.92,
    );
  });
  if (!blob) {
    throw new Error('裁切导出失败');
  }
  return blob;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}
