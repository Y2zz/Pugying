import { useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { getPugyingDesktopBridge } from '@/lib/agent-client';
import { cn } from '@/lib/utils';
import {
  centeredImageCrop,
  FULL_IMAGE_CROP,
  moveImageCrop,
  resizeImageCrop,
  type ArticleImageCrop,
  type CropCorner,
  type CropPoint,
} from './article-image-crop';

const RATIOS = [
  { label: '原图比例', value: 'original', ratio: null },
  { label: '1:1', value: 'square', ratio: 1 },
  { label: '2:3', value: 'portrait', ratio: 2 / 3 },
  { label: '3:2', value: 'landscape', ratio: 3 / 2 },
  { label: '9:16', value: 'tall', ratio: 9 / 16 },
  { label: '16:9', value: 'wide', ratio: 16 / 9 },
  { label: '自由', value: 'free', ratio: null },
] as const;
const CORNERS = {
  nw: { label: '左上角', className: '-left-1 -top-1 cursor-nwse-resize' },
  ne: { label: '右上角', className: '-right-1 -top-1 cursor-nesw-resize' },
  sw: { label: '左下角', className: '-left-1 -bottom-1 cursor-nesw-resize' },
  se: { label: '右下角', className: '-right-1 -bottom-1 cursor-nwse-resize' },
};
type Drag = {
  start: CropPoint;
  crop: ArticleImageCrop;
  mode: 'move' | 'draw' | CropCorner;
};

/** 只编辑裁剪范围；确定后替换正文图片，原文件保留。 */
export function ArticleImageEditDialog({
  source,
  localPath,
  onClose,
  onSaved,
  returnFocus,
}: {
  source: string;
  localPath: string;
  onClose: () => void;
  onSaved: (path: string, preview: string) => void;
  returnFocus?: HTMLElement;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [crop, setCrop] = useState(FULL_IMAGE_CROP);
  const [ratio, setRatio] = useState('original');
  const [imageRatio, setImageRatio] = useState(1);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedRatio = RATIOS.find((item) => item.value === ratio)!;
  const normalizedRatio =
    ratio === 'free' ? null : (selectedRatio.ratio || imageRatio) / imageRatio;
  const point = (event: PointerEvent): CropPoint => {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const startDrag = (event: PointerEvent, mode: Drag['mode']) => {
    if (saving || !ready) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    stageRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = { start: point(event), crop, mode };
  };
  const selectCrop = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const end = point(event);
    if (drag.mode === 'move') {
      setCrop(
        moveImageCrop(drag.crop, {
          x: end.x - drag.start.x,
          y: end.y - drag.start.y,
        }),
      );
    } else if (drag.mode === 'draw') {
      const corner: CropCorner = `${end.y < drag.start.y ? 'n' : 's'}${end.x < drag.start.x ? 'w' : 'e'}`;
      setCrop(
        resizeImageCrop(
          { x: drag.start.x, y: drag.start.y, w: 0, h: 0 },
          corner,
          end,
          normalizedRatio,
        ),
      );
    } else {
      setCrop(resizeImageCrop(drag.crop, drag.mode, end, normalizedRatio));
    }
  };
  const save = async () => {
    const image = imageRef.current;
    const bridge = getPugyingDesktopBridge();
    if (!ready || !image || saving) {
      return;
    }
    if (!bridge?.saveArticleImage) {
      toast.add({ type: 'error', title: '请从桌面应用打开后再试' });
      return;
    }
    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * crop.w));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * crop.h));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas unavailable');
      }
      ctx.drawImage(
        image,
        image.naturalWidth * crop.x,
        image.naturalHeight * crop.y,
        image.naturalWidth * crop.w,
        image.naturalHeight * crop.h,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const data = canvas.toDataURL('image/png');
      const path = await bridge.saveArticleImage(data, localPath);
      if (path) {
        onSaved(path, data);
      } else {
        toast.add({ type: 'error', title: '图片保存失败，请重试' });
      }
    } catch {
      toast.add({ type: 'error', title: '图片保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-4xl"
        showCloseButton={!saving}
        finalFocus={() => (returnFocus?.isConnected ? returnFocus : false)}
      >
        <DialogHeader>
          <DialogTitle>裁剪图片</DialogTitle>
          <DialogDescription>
            选择比例，拖动裁剪框或四角调整范围。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-md bg-muted p-3">
            <div
              ref={stageRef}
              className="relative touch-none cursor-crosshair"
              onPointerDown={(event) => startDrag(event, 'draw')}
              onPointerMove={selectCrop}
              onPointerUp={(event) => {
                selectCrop(event);
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              <img
                ref={imageRef}
                src={source}
                alt="图片裁剪预览"
                draggable={false}
                className="block h-auto w-auto max-h-[min(28rem,50vh)] max-w-full"
                onLoad={(event) => {
                  setImageRatio(
                    event.currentTarget.naturalWidth /
                      event.currentTarget.naturalHeight,
                  );
                  setReady(true);
                }}
                onError={() => {
                  setReady(false);
                  toast.add({
                    type: 'error',
                    title: '图片无法读取，请重新选择',
                  });
                }}
              />
              {ready ? (
                <div
                  className="absolute cursor-move border-2 border-primary"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`,
                    height: `${crop.h * 100}%`,
                    boxShadow: '0 0 0 9999px rgb(0 0 0 / 40%)',
                  }}
                  onPointerDown={(event) => startDrag(event, 'move')}
                >
                  <button
                    type="button"
                    aria-label="移动裁剪框"
                    className="absolute inset-0 cursor-move focus-visible:outline-2 focus-visible:outline-primary"
                    disabled={saving}
                    onKeyDown={(event) => {
                      const direction = {
                        ArrowLeft: [-1, 0],
                        ArrowRight: [1, 0],
                        ArrowUp: [0, -1],
                        ArrowDown: [0, 1],
                      }[event.key];
                      if (direction) {
                        event.preventDefault();
                        const step = event.shiftKey ? 10 : 2;
                        setCrop(
                          moveImageCrop(crop, {
                            x:
                              (direction[0] * step) /
                              imageRef.current!.naturalWidth,
                            y:
                              (direction[1] * step) /
                              imageRef.current!.naturalHeight,
                          }),
                        );
                      }
                    }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
                  >
                    {Array.from({ length: 9 }, (_, index) => (
                      <span key={index} className="border border-white/40" />
                    ))}
                  </div>
                  {(Object.keys(CORNERS) as CropCorner[]).map((corner) => (
                    <button
                      key={corner}
                      type="button"
                      aria-label={`调整裁剪框${CORNERS[corner].label}`}
                      disabled={saving}
                      className={cn(
                        'absolute z-10 size-3 border border-primary bg-white focus-visible:outline-2 focus-visible:outline-primary',
                        CORNERS[corner].className,
                      )}
                      onPointerDown={(event) => startDrag(event, corner)}
                      onKeyDown={(event) => {
                        const direction = {
                          ArrowLeft: [-1, 0],
                          ArrowRight: [1, 0],
                          ArrowUp: [0, -1],
                          ArrowDown: [0, 1],
                        }[event.key];
                        if (direction) {
                          event.preventDefault();
                          const step = event.shiftKey ? 10 : 2;
                          setCrop(
                            resizeImageCrop(
                              crop,
                              corner,
                              {
                                x:
                                  crop.x +
                                  (corner.endsWith('e') ? crop.w : 0) +
                                  (direction[0] * step) /
                                    imageRef.current!.naturalWidth,
                                y:
                                  crop.y +
                                  (corner.startsWith('s') ? crop.h : 0) +
                                  (direction[1] * step) /
                                    imageRef.current!.naturalHeight,
                              },
                              normalizedRatio,
                            ),
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div
            role="group"
            aria-label="裁剪比例"
            className="grid grid-cols-4 gap-2 self-start sm:grid-cols-2"
          >
            {RATIOS.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={ratio === item.value ? 'secondary' : 'outline'}
                className="h-auto flex-col gap-2 py-3"
                disabled={!ready || saving}
                aria-pressed={ratio === item.value}
                onClick={() => {
                  setRatio(item.value);
                  setCrop(
                    item.value === 'free'
                      ? crop
                      : centeredImageCrop(item.ratio || imageRatio, imageRatio),
                  );
                }}
              >
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center"
                >
                  <span
                    className="max-h-full max-w-full border border-current"
                    style={{
                      aspectRatio: item.ratio || imageRatio,
                      width: `${Math.min(1, item.ratio || imageRatio) * 100}%`,
                    }}
                  />
                </span>
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setCrop(FULL_IMAGE_CROP);
              setRatio('original');
            }}
          >
            重置
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={
              !ready ||
              saving ||
              crop.w * (imageRef.current?.naturalWidth || 0) < 1 ||
              crop.h * (imageRef.current?.naturalHeight || 0) < 1
            }
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '确定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
