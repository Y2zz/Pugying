import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/app-toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ImagePlus } from "lucide-react";
import { ArticleImageCropArea } from "./ArticleImageCropArea";
import { centeredImageCrop, FULL_IMAGE_CROP } from "./article-image-crop";

const RATIOS = [
  { label: "原图比例", value: "original", ratio: null },
  { label: "1:1", value: "square", ratio: 1 },
  { label: "2:3", value: "portrait", ratio: 2 / 3 },
  { label: "3:2", value: "landscape", ratio: 3 / 2 },
  { label: "9:16", value: "tall", ratio: 9 / 16 },
  { label: "16:9", value: "wide", ratio: 16 / 9 },
  { label: "自由", value: "free", ratio: null },
] as const;
/** 正文图片与文章封面共用的裁剪交互；保存由调用方处理。 */
export function ArticleImageCropDialog({
  source,
  onClose,
  onSave,
  returnFocus,
  fixedRatio,
  title = "裁剪图片",
  imageAction,
  emptyDescription = "选择一张图片，开始调整裁剪范围。",
  emptyHint,
}: {
  source: string;
  onClose: () => void;
  onSave: (canvas: HTMLCanvasElement) => Promise<void>;
  fixedRatio?: number;
  title?: string;
  imageAction?: (disabled: boolean, empty?: boolean) => ReactNode;
  emptyDescription?: string;
  emptyHint?: string;
  returnFocus?: HTMLElement;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState(FULL_IMAGE_CROP);
  const [ratio, setRatio] = useState("original");
  const [imageRatio, setImageRatio] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const hasSource = Boolean(source) && !imageFailed;
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedRatio = RATIOS.find((item) => item.value === ratio)!;
  const normalizedRatio = fixedRatio
    ? fixedRatio / imageRatio
    : ratio === "free"
      ? null
      : (selectedRatio.ratio || imageRatio) / imageRatio;
  const save = async () => {
    const image = imageRef.current;
    if (!ready || !image || saving) {
      return;
    }
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * crop.w));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * crop.h));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas unavailable");
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
      await onSave(canvas);
    } catch {
      toast.add({ type: "error", title: "图片保存失败，请重试" });
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
        className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-xl"
        showCloseButton={!saving}
        finalFocus={
          returnFocus
            ? () => (returnFocus.isConnected ? returnFocus : false)
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {!hasSource
              ? "先选择图片，再调整封面构图。"
              : fixedRatio
                ? "拖动裁剪框或四角调整范围。"
                : "选择比例，拖动裁剪框或四角调整范围。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-3">
          {hasSource ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {imageAction?.(saving, false)}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving || !ready}
                onClick={() => {
                  setCrop(
                    fixedRatio
                      ? centeredImageCrop(fixedRatio, imageRatio)
                      : FULL_IMAGE_CROP,
                  );
                  setRatio("original");
                }}
              >
                重置
              </Button>
            </div>
          ) : null}
          {hasSource ? (
            <ArticleImageCropArea
              source={source}
              crop={crop}
              normalizedRatio={normalizedRatio}
              disabled={saving}
              imageRef={imageRef}
              onChange={setCrop}
              onLoad={(image) => {
                const nextRatio = image.naturalWidth / image.naturalHeight;
                setImageRatio(nextRatio);
                setCrop(
                  fixedRatio
                    ? centeredImageCrop(fixedRatio, nextRatio)
                    : FULL_IMAGE_CROP,
                );
                setReady(true);
              }}
              onError={() => {
                setReady(false);
                setImageFailed(true);
                toast.add({ type: "error", title: "图片无法读取，请重新选择" });
              }}
            />
          ) : (
            <Empty className="min-h-[min(20rem,40dvh)] border bg-muted/20 px-6 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ImagePlus aria-hidden />
                </EmptyMedia>
                <EmptyTitle>
                  {imageFailed ? "重新选择封面图片" : "选择封面图片"}
                </EmptyTitle>
                <EmptyDescription>
                  {imageFailed
                    ? "图片无法读取，请选择另一张图片。"
                    : emptyDescription}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {imageAction?.(saving, true)}
                {emptyHint ? (
                  <p className="text-xs text-muted-foreground">{emptyHint}</p>
                ) : null}
              </EmptyContent>
            </Empty>
          )}
          {hasSource && !fixedRatio ? (
            <ToggleGroup
              aria-label="裁剪比例"
              variant="outline"
              size="sm"
              className="flex-wrap"
              value={[ratio]}
              disabled={!ready || saving}
              onValueChange={(values) => {
                const value = values[0];
                const selected = RATIOS.find((item) => item.value === value);
                if (!selected) {
                  return;
                }
                setRatio(value);
                setCrop(
                  value === "free"
                    ? crop
                    : centeredImageCrop(
                        selected.ratio || imageRatio,
                        imageRatio,
                      ),
                );
              }}
            >
              {RATIOS.map((item) => (
                <ToggleGroupItem key={item.value} value={item.value}>
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </Button>
          {hasSource ? (
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
              {saving ? "保存中…" : "确定"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
