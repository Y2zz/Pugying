import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

export type CoverAspect = '3:4' | '16:9';

const ASPECT_RATIO: Record<CoverAspect, number> = {
  '3:4': 3 / 4,
  '16:9': 16 / 9,
};

interface CoverCropDialogProps {
  open: boolean;
  file: File | null;
  /** 已有封面图 URL（blob / http / 签名链），与 file 二选一，用于「裁剪」当前封面 */
  sourceUrl?: string | null;
  aspect: CoverAspect;
  title?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (blob: Blob, fileName: string) => void;
}

/**
 * 用户侧封面裁剪：固定比例视窗 + 缩放拖移；拖移/缩放后图片始终盖住裁剪框（不可露出空白）。
 */
export function CoverCropDialog({
  open,
  file,
  sourceUrl = null,
  aspect,
  title,
  onOpenChange,
  onConfirm,
}: CoverCropDialogProps) {
  const ratio = ASPECT_RATIO[aspect];
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    if (!open) {
      const reset = setTimeout(() => {
        revokeObjectUrl();
        setImageUrl(null);
        setLoadError('');
        setNatural({ w: 0, h: 0 });
        setViewport({ w: 0, h: 0 });
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }, 0);
      return () => {
        clearTimeout(reset);
      };
    }

    revokeObjectUrl();

    let nextUrl: string | null = null;
    if (file) {
      nextUrl = URL.createObjectURL(file);
      objectUrlRef.current = nextUrl;
    } else if (sourceUrl?.trim()) {
      nextUrl = sourceUrl.trim();
    }

    const apply = setTimeout(() => {
      setLoadError('');
      setNatural({ w: 0, h: 0 });
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setImageUrl(nextUrl);
    }, 0);

    return () => {
      clearTimeout(apply);
    };
  }, [file, sourceUrl, open]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setOffset({ x: 0, y: 0 });
        setLoadError('');
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setNatural({ w: 0, h: 0 });
        setLoadError('图片加载失败');
      }
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    let observer: ResizeObserver | null = null;
    let raf = 0;
    let tries = 0;

    const measure = () => {
      const el = viewportRef.current;
      if (!el) {
        if (tries < 20) {
          tries += 1;
          raf = requestAnimationFrame(measure);
        }
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport((prev) =>
          prev.w === rect.width && prev.h === rect.height
            ? prev
            : { w: rect.width, h: rect.height },
        );
      }
      if (!observer) {
        observer = new ResizeObserver(() => {
          const next = viewportRef.current?.getBoundingClientRect();
          if (!next || next.width <= 0 || next.height <= 0) {
            return;
          }
          setViewport((prev) =>
            prev.w === next.width && prev.h === next.height
              ? prev
              : { w: next.width, h: next.height },
          );
        });
        observer.observe(el);
      }
    };

    measure();
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [open, aspect, imageUrl, natural.w]);

  const frame = fitFrame(natural.w, natural.h, viewport.w, viewport.h, scale);

  useEffect(() => {
    if (!frame.displayW || !viewport.w) {
      return;
    }
    const frameW = frame.displayW;
    const frameH = frame.displayH;
    const vw = viewport.w;
    const vh = viewport.h;
    const clamp = setTimeout(() => {
      setOffset((prev) => clampOffset(prev, frameW, frameH, vw, vh));
    }, 0);
    return () => {
      clearTimeout(clamp);
    };
  }, [frame.displayW, frame.displayH, viewport.w, viewport.h, scale]);

  const onPointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) {
      return;
    }
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setOffset(
      clampOffset(
        {
          x: dragRef.current.originX + dx,
          y: dragRef.current.originY + dy,
        },
        frame.displayW,
        frame.displayH,
        viewport.w,
        viewport.h,
      ),
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const confirm = async () => {
    if (!imageUrl || !natural.w || !viewport.w || !frame.displayW) {
      return;
    }
    const outW = aspect === '3:4' ? 1080 : 1280;
    const outH = Math.round(outW / ratio);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const img = await loadImage(imageUrl);
    const { displayW, displayH } = frame;
    const left = (viewport.w - displayW) / 2 + offset.x;
    const top = (viewport.h - displayH) / 2 + offset.y;
    const scaleX = natural.w / displayW;
    const scaleY = natural.h / displayH;
    const sx = Math.max(0, -left * scaleX);
    const sy = Math.max(0, -top * scaleY);
    const sw = Math.min(natural.w - sx, viewport.w * scaleX);
    const sh = Math.min(natural.h - sy, viewport.h * scaleY);
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
      return;
    }
    const base = (file?.name || 'cover').replace(/\.[^.]+$/, '');
    onConfirm(blob, `${base}-${aspect.replace(':', 'x')}.jpg`);
    onOpenChange(false);
  };

  const showImage = Boolean(imageUrl && natural.w > 0 && frame.displayW > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title ?? `裁剪封面 ${aspect}`}</DialogTitle>
          <DialogDescription>
            拖移调整构图，滑动缩放。图片须始终盖住裁剪框（不可拖出边界），导出比例{' '}
            {aspect}。
          </DialogDescription>
        </DialogHeader>

        <div
          ref={viewportRef}
          className="relative mx-auto w-full max-w-sm touch-none overflow-hidden bg-muted select-none"
          style={{ aspectRatio: `${ratio}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {showImage ? (
            <img
              src={imageUrl!}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
              style={{
                width: frame.displayW,
                height: frame.displayH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
              {loadError
                ? loadError
                : imageUrl
                  ? '加载中…'
                  : '未选择图片'}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-xs text-muted-foreground">缩放</span>
          {/*
            Base UI 单拇指可用标量 value={scale}；但本地 ui/slider 用
            Array.isArray(value) 计拇指数，标量会回退成 [min,max] 渲染双拇指。
            在禁止改 components/ui 的前提下，单拇指仍传数组以保裁剪缩放可用。
          */}
          <Slider
            min={1}
            max={3}
            step={0.01}
            value={[scale]}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (typeof next === 'number') {
                setScale(next);
              }
            }}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            取消
          </Button>
          <Button disabled={!showImage} onClick={() => void confirm()}>
            使用此裁剪
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 以 cover 方式铺满视窗，再乘用户缩放（≥1 保证始终盖住） */
function fitFrame(
  naturalW: number,
  naturalH: number,
  vw: number,
  vh: number,
  scale: number,
): { displayW: number; displayH: number } {
  if (!naturalW || !naturalH || !vw || !vh) {
    return { displayW: 0, displayH: 0 };
  }
  const cover = Math.max(vw / naturalW, vh / naturalH) * Math.max(1, scale);
  return {
    displayW: naturalW * cover,
    displayH: naturalH * cover,
  };
}

/**
 * 限制偏移：图片边缘不得进入裁剪框内侧（不允许露出空白）。
 * 图片中心默认在视窗中心，offset 为相对位移。
 */
export function clampOffset(
  offset: { x: number; y: number },
  displayW: number,
  displayH: number,
  vw: number,
  vh: number,
): { x: number; y: number } {
  if (!displayW || !displayH || !vw || !vh) {
    return { x: 0, y: 0 };
  }
  const maxX = Math.max(0, (displayW - vw) / 2);
  const maxY = Math.max(0, (displayH - vh) / 2);
  const x = Math.min(maxX, Math.max(-maxX, offset.x));
  const y = Math.min(maxY, Math.max(-maxY, offset.y));
  return {
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
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
