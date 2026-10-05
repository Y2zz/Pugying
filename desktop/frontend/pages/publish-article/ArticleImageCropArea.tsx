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
  moveImageCrop,
  resizeImageCrop,
  type ArticleImageCrop,
  type CropCorner,
  type CropPoint,
} from './article-image-crop';

const CORNERS = {
  nw: {
    label: '左上角',
    position: '-left-3 -top-3 cursor-nwse-resize',
    mark: 'border-l-2 border-t-2',
  },
  ne: {
    label: '右上角',
    position: '-right-3 -top-3 cursor-nesw-resize',
    mark: 'border-r-2 border-t-2',
  },
  sw: {
    label: '左下角',
    position: '-left-3 -bottom-3 cursor-nesw-resize',
    mark: 'border-l-2 border-b-2',
  },
  se: {
    label: '右下角',
    position: '-right-3 -bottom-3 cursor-nwse-resize',
    mark: 'border-r-2 border-b-2',
  },
};
type Drag = {
  start: CropPoint;
  crop: ArticleImageCrop;
  mode: 'move' | 'draw' | CropCorner;
  pointerId: number;
};

/** 只负责图片展示和范围调整；坐标始终相对于实际显示的图片。 */
export function ArticleImageCropArea({
  source,
  crop,
  normalizedRatio,
  disabled,
  imageRef,
  onChange,
  onLoad,
  onError,
}: {
  source: string;
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
  const [dragging, setDragging] = useState(false);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const size = fitCropImage(natural, viewport);
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

  const point = (event: PointerEvent): CropPoint => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const start = (event: PointerEvent, mode: Drag['mode']) => {
    if (!ready || disabled || event.button !== 0 || dragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    surfaceRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      start: point(event),
      crop,
      mode,
      pointerId: event.pointerId,
    };
    setDragging(true);
  };
  const update = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || disabled) {
      return;
    }
    const end = point(event);
    if (drag.mode === 'move') {
      onChange(
        moveImageCrop(drag.crop, {
          x: end.x - drag.start.x,
          y: end.y - drag.start.y,
        }),
      );
    } else if (drag.mode === 'draw') {
      const rect = surfaceRef.current!.getBoundingClientRect();
      if (
        Math.hypot(
          (end.x - drag.start.x) * rect.width,
          (end.y - drag.start.y) * rect.height,
        ) < 4
      ) {
        return;
      }
      const corner: CropCorner = `${end.y < drag.start.y ? 'n' : 's'}${end.x < drag.start.x ? 'w' : 'e'}`;
      onChange(
        resizeImageCrop(
          { x: drag.start.x, y: drag.start.y, w: 0, h: 0 },
          corner,
          end,
          normalizedRatio,
        ),
      );
    } else {
      onChange(resizeImageCrop(drag.crop, drag.mode, end, normalizedRatio));
    }
  };
  const end = () => {
    dragRef.current = null;
    setDragging(false);
  };
  const keyboard = (event: KeyboardEvent, corner?: CropCorner) => {
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
    onChange(
      corner
        ? resizeImageCrop(
            crop,
            corner,
            {
              x: crop.x + (corner.endsWith('e') ? crop.w : 0) + delta.x,
              y: crop.y + (corner.startsWith('s') ? crop.h : 0) + delta.y,
            },
            normalizedRatio,
          )
        : moveImageCrop(crop, delta),
    );
  };

  return (
    <div className="flex h-[min(20rem,40vh)] items-center justify-center rounded-lg border bg-muted p-4">
      <div
        ref={viewportRef}
        className="flex size-full min-w-0 items-center justify-center"
      >
        <div
          ref={surfaceRef}
          className="relative isolate shrink-0 touch-none select-none"
          style={{ width: size.width, height: size.height }}
          onPointerDown={(event) => start(event, 'draw')}
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
            }
            end();
          }}
          onLostPointerCapture={end}
        >
          <img
            ref={imageRef}
            src={source}
            alt="图片裁剪预览"
            draggable={false}
            className="block size-full"
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
          {ready ? (
            <>
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
              >
                <path
                  fill="black"
                  fillOpacity="0.5"
                  fillRule="evenodd"
                  d={`M0 0H1V1H0Z M${crop.x} ${crop.y}h${crop.w}v${crop.h}h${-crop.w}Z`}
                />
              </svg>
              <div
                className="group/crop absolute border border-white"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                }}
              >
                <button
                  type="button"
                  aria-label="移动裁剪框"
                  disabled={disabled}
                  className={cn(
                    'absolute inset-0 cursor-grab focus-visible:outline-2 focus-visible:outline-ring',
                    dragging && 'cursor-grabbing',
                  )}
                  onPointerDown={(event) => start(event, 'move')}
                  onKeyDown={(event) => keyboard(event)}
                />
                <div
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/crop:opacity-100 group-focus-within/crop:opacity-100',
                    dragging && 'opacity-100',
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
  );
}
