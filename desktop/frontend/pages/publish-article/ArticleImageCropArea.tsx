import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';
import {
  fitCropImage,
  clampImageOffset,
  moveImageCrop,
  imageCropBounds,
  fitImageCrop,
  resizeImageCrop,
  type ArticleImageCrop,
  type CropCorner,
  type CropPoint,
} from './article-image-crop';

const CORNERS = {
  nw: {
    label: '左上角',
    position: 'left-0 top-0 cursor-nwse-resize',
    mark: 'border-l-2 border-t-2',
  },
  ne: {
    label: '右上角',
    position: 'right-0 top-0 cursor-nesw-resize',
    mark: 'border-r-2 border-t-2',
  },
  sw: {
    label: '左下角',
    position: 'left-0 bottom-0 cursor-nesw-resize',
    mark: 'border-l-2 border-b-2',
  },
  se: {
    label: '右下角',
    position: 'right-0 bottom-0 cursor-nwse-resize',
    mark: 'border-r-2 border-b-2',
  },
};
const EDGES = {
  n: { label: '上边', position: 'inset-x-6 top-0 h-6' },
  e: { label: '右边', position: 'inset-y-6 right-0 w-6' },
  s: { label: '下边', position: 'inset-x-6 bottom-0 h-6' },
  w: { label: '左边', position: 'inset-y-6 left-0 w-6' },
};
type Drag = {
  start: CropPoint;
  crop: ArticleImageCrop;
  offset: CropPoint;
  mode: 'pan' | 'move' | CropCorner;
  pointerId: number;
};

/** 裁剪框相对初始图片尺寸归一化，缩放仅作用于底层图片。 */
export function ArticleImageCropArea({
  source,
  zoom = 1,
  imageOffset,
  onImageOffsetChange,
  crop,
  normalizedRatio,
  disabled,
  imageRef,
  onChange,
  onLoad,
  onError,
}: {
  source: string;
  zoom?: number;
  imageOffset: CropPoint;
  onImageOffsetChange: (offset: CropPoint) => void;
  crop: ArticleImageCrop;
  normalizedRatio: number | null;
  disabled?: boolean;
  imageRef: RefObject<HTMLImageElement | null>;
  onChange: (crop: ArticleImageCrop) => void;
  onLoad: (image: HTMLImageElement) => void;
  onError: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragMode, setDragMode] = useState<Drag['mode'] | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // 画布占满预览区；图片保持比例居中，坐标仍相对初始图片尺寸。
  const size = fitCropImage(natural, viewport);
  const imageLeft = (viewport.width - size.width) / 2;
  const imageTop = (viewport.height - size.height) / 2;
  const canvas = {
    x: size.width > 0 ? -imageLeft / size.width : 0,
    y: size.height > 0 ? -imageTop / size.height : 0,
    w: size.width > 0 ? viewport.width / size.width : 0,
    h: size.height > 0 ? viewport.height / size.height : 0,
  };
  const bounds = imageCropBounds(zoom, imageOffset, canvas);
  const visibleImage = {
    x: imageLeft + bounds.x * size.width,
    y: imageTop + bounds.y * size.height,
    w: bounds.w * size.width,
    h: bounds.h * size.height,
  };
  const frame = {
    x: imageLeft + crop.x * size.width,
    y: imageTop + crop.y * size.height,
    w: crop.w * size.width,
    h: crop.h * size.height,
  };
  const ready = natural.width > 0 && natural.height > 0;

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }
    const measure = () => {
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (size.width <= 0 || size.height <= 0) {
      return;
    }
    // 预览区缩小时先放回可见画布，再由上层校正图片位置以覆盖裁剪框。
    const next = fitImageCrop(crop, canvas);
    if (
      Math.abs(next.x - crop.x) > 1e-10 ||
      Math.abs(next.y - crop.y) > 1e-10 ||
      Math.abs(next.w - crop.w) > 1e-10 ||
      Math.abs(next.h - crop.h) > 1e-10
    ) {
      onChange(next);
    }
  }, [
    crop,
    canvas.x,
    canvas.y,
    canvas.w,
    canvas.h,
    size.width,
    size.height,
    onChange,
  ]);

  const point = (event: PointerEvent): CropPoint => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - imageLeft) / size.width,
      y: (event.clientY - rect.top - imageTop) / size.height,
    };
  };
  const start = (event: PointerEvent, mode: Drag['mode']) => {
    if (
      !ready ||
      size.width <= 0 ||
      size.height <= 0 ||
      disabled ||
      event.button !== 0 ||
      dragRef.current
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    surfaceRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      start: point(event),
      crop,
      offset: imageOffset,
      mode,
      pointerId: event.pointerId,
    };
    setDragMode(mode);
  };
  const update = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || disabled) {
      return;
    }
    const end = point(event);
    if (drag.mode === 'pan') {
      onImageOffsetChange(
        clampImageOffset(
          {
            x: drag.offset.x + end.x - drag.start.x,
            y: drag.offset.y + end.y - drag.start.y,
          },
          crop,
          zoom,
        ),
      );
    } else if (drag.mode === 'move') {
      onChange(
        moveImageCrop(
          drag.crop,
          { x: end.x - drag.start.x, y: end.y - drag.start.y },
          zoom,
          drag.offset,
          canvas,
        ),
      );
    } else {
      onChange(
        resizeImageCrop(
          drag.crop,
          drag.mode,
          {
            x:
              drag.crop.x +
              (drag.mode.endsWith('e') ? drag.crop.w : 0) +
              end.x -
              drag.start.x,
            y:
              drag.crop.y +
              (drag.mode.startsWith('s') ? drag.crop.h : 0) +
              end.y -
              drag.start.y,
          },
          normalizedRatio,
          bounds,
        ),
      );
    }
  };
  const end = () => {
    dragRef.current = null;
    setDragMode(null);
  };
  const keyboard = (event: KeyboardEvent, mode: Drag['mode'] = 'pan') => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction || !ready || disabled) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 10 : 2;
    const delta = {
      x: (direction[0] * step) / natural.width,
      y: (direction[1] * step) / natural.height,
    };
    if (mode === 'move') {
      onChange(moveImageCrop(crop, delta, zoom, imageOffset, canvas));
    } else if (mode !== 'pan') {
      onChange(
        resizeImageCrop(
          crop,
          mode,
          {
            x: crop.x + (mode.endsWith('e') ? crop.w : 0) + delta.x,
            y: crop.y + (mode.startsWith('s') ? crop.h : 0) + delta.y,
          },
          normalizedRatio,
          bounds,
        ),
      );
    } else {
      onImageOffsetChange(
        clampImageOffset(
          {
            x: imageOffset.x + delta.x,
            y: imageOffset.y + delta.y,
          },
          crop,
          zoom,
        ),
      );
    }
  };

  return (
    <div className="flex h-[min(20rem,40vh)] overflow-hidden rounded-lg border bg-muted/40">
      <div ref={viewportRef} className="size-full min-w-0">
        <div
          className="flex items-center justify-center"
          style={{
            width: viewport.width,
            height: viewport.height,
          }}
        >
          <div
            ref={surfaceRef}
            role="group"
            aria-label="图片裁剪区域"
            className="relative isolate shrink-0 touch-none select-none"
            style={{ width: viewport.width, height: viewport.height }}
            onPointerDown={(event) => start(event, 'pan')}
            onPointerMove={update}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) {
                return;
              }
              update(event);
              end();
            }}
            onPointerCancel={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) {
                return;
              }
              if (dragRef.current) {
                onChange(dragRef.current.crop);
                onImageOffsetChange(dragRef.current.offset);
              }
              end();
            }}
            onLostPointerCapture={end}
          >
            <div className="absolute inset-0 overflow-hidden">
              <img
                ref={imageRef}
                src={source}
                alt="图片裁剪预览"
                draggable={false}
                className="absolute block max-w-none"
                style={{
                  width: size.width,
                  height: size.height,
                  left: imageLeft,
                  top: imageTop,
                  transform: `translate(${imageOffset.x * 100}%, ${imageOffset.y * 100}%) scale(${zoom})`,
                  transformOrigin: 'center',
                }}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setNatural({
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  });
                  onLoad(image);
                }}
                onError={() => {
                  setNatural({ width: 0, height: 0 });
                  onError();
                }}
              />
            </div>
            {ready ? (
              <>
                <svg
                  aria-hidden
                  className="pointer-events-none absolute inset-0 size-full"
                  viewBox={`0 0 ${viewport.width || 1} ${viewport.height || 1}`}
                  preserveAspectRatio="none"
                >
                  <path
                    fill="black"
                    fillOpacity="0.5"
                    fillRule="evenodd"
                    d={`M${visibleImage.x} ${visibleImage.y}h${visibleImage.w}v${visibleImage.h}h${-visibleImage.w}Z M${frame.x} ${frame.y}h${frame.w}v${frame.h}h${-frame.w}Z`}
                  />
                </svg>
                <div
                  className="group/crop absolute border border-white"
                  style={{
                    left: frame.x,
                    top: frame.y,
                    width: frame.w,
                    height: frame.h,
                  }}
                >
                  <button
                    type="button"
                    aria-label="移动图片"
                    disabled={disabled}
                    className={cn(
                      'absolute inset-0 cursor-grab focus-visible:outline-2 focus-visible:outline-ring',
                      dragMode === 'pan' && 'cursor-grabbing',
                    )}
                    onPointerDown={(event) => start(event, 'pan')}
                    onKeyDown={(event) => keyboard(event)}
                  />
                  <div
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/crop:opacity-100 group-focus-within/crop:opacity-100',
                      dragMode !== null && 'opacity-100',
                    )}
                  >
                    {[1, 2].map((line) => (
                      <span key={line}>
                        <span
                          className="absolute inset-y-0 border-l border-white/40"
                          style={{ left: `${(line * 100) / 3}%` }}
                        />
                        <span
                          className="absolute inset-x-0 border-t border-white/40"
                          style={{ top: `${(line * 100) / 3}%` }}
                        />
                      </span>
                    ))}
                  </div>
                  {Object.entries(EDGES).map(([edge, { label, position }]) => (
                    <button
                      key={edge}
                      type="button"
                      aria-label={`移动裁剪框${label}`}
                      disabled={disabled}
                      className={cn(
                        'absolute cursor-move focus-visible:outline-2 focus-visible:outline-ring',
                        position,
                      )}
                      onPointerDown={(event) => start(event, 'move')}
                      onKeyDown={(event) => keyboard(event, 'move')}
                    />
                  ))}
                  {(Object.keys(CORNERS) as CropCorner[]).map((corner) => (
                    <button
                      key={corner}
                      type="button"
                      aria-label={`调整裁剪框${CORNERS[corner].label}`}
                      disabled={disabled}
                      className={cn(
                        'absolute flex size-6 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring',
                        CORNERS[corner].position,
                      )}
                      onPointerDown={(event) => start(event, corner)}
                      onKeyDown={(event) => keyboard(event, corner)}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'pointer-events-none size-3 border-white drop-shadow-sm',
                          CORNERS[corner].mark,
                        )}
                      />
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
