import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 首次进入发布页：全宽上传选择区（未进入表单前使用，非 9:16 单柱） */
export function VideoInitialUploadSelector({
  dragOver,
  disabled,
  onPickClick,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  dragOver: boolean;
  disabled: boolean;
  onPickClick: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      className={cn(
        "flex min-h-[280px] w-full flex-col gap-3 border-dashed px-4 py-10 text-center whitespace-normal",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40",
        "disabled:opacity-60",
      )}
      onClick={onPickClick}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Upload className="size-8 text-muted-foreground" />
      <div className="mx-auto flex max-w-sm flex-col gap-1.5">
        <p className="text-sm font-medium">拖入或选择视频</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          自动提取封面；视频大小和时长按发布平台校验。
        </p>
      </div>
    </Button>
  );
}
