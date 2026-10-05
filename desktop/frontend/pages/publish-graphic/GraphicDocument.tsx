import { useState, type ChangeEvent, type RefObject } from "react";
import { AlertCircle, ImagePlus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { getLocalFilePath } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  CharCountInput,
  CharCountTextarea,
} from "../publish-video/CharCountFields";
import { localPathToFileUrl } from "../publish-article/helpers";
import type { PathWarning } from "./use-graphic-composer";

/**
 * 图文撰写区：标准 Field 表单（标题 / 图片 / 文案），与视频页通用信息一致。
 */
export function GraphicDocument({
  title,
  onTitleChange,
  titleMax,
  limitsActive,
  body,
  onBodyChange,
  bodyMax,
  mediaPaths,
  onMediaPathsChange,
  pathWarning,
  disabled,
  titleRef,
  validationAttempted = false,
  bodyRef,
  imagesRef,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleMax: number;
  limitsActive: boolean;
  body: string;
  onBodyChange: (value: string) => void;
  bodyMin: number;
  bodyMax: number;
  mediaPaths: string[];
  onMediaPathsChange: (paths: string[]) => void;
  pathWarning: PathWarning;
  disabled?: boolean;
  titleRef: RefObject<HTMLInputElement | null>;
  validationAttempted?: boolean;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
  imagesRef: RefObject<HTMLDivElement | null>;
}) {
  const [titleTouched, setTitleTouched] = useState(false);
  const titleError =
    (titleTouched || validationAttempted) && !title.trim() ? "请填写标题" : "";

  const effectiveTitleMax = limitsActive ? titleMax : Math.max(titleMax, 200);
  const effectiveBodyMax = limitsActive ? bodyMax : Math.max(bodyMax, 1000);

  const onPickImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    const next = [...mediaPaths];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        continue;
      }
      const path = getLocalFilePath(file);
      if (!path || next.includes(path)) {
        continue;
      }
      next.push(path);
    }
    onMediaPathsChange(next);
  };

  const removeAt = (index: number) => {
    onMediaPathsChange(mediaPaths.filter((_, i) => i !== index));
  };

  return (
    <FieldGroup className="gap-4">
      <Field
        data-invalid={
          Boolean(titleError) || title.length > effectiveTitleMax || undefined
        }
      >
        <FieldLabel className="font-normal" htmlFor="graphic-title">
          标题
        </FieldLabel>
        <CharCountInput
          id="graphic-title"
          ref={titleRef}
          validationMessage={titleError}
          placeholder="填写作品标题"
          max={effectiveTitleMax}
          disabled={disabled}
          value={title}
          onBlur={() => setTitleTouched(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              bodyRef.current?.focus();
            }
          }}
          onChange={(e) => {
            onTitleChange(e.target.value.replace(/[\r\n]+/g, " "));
          }}
        />
      </Field>

      <Field>
        <div
          ref={imagesRef}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <FieldTitle className="font-normal">图片</FieldTitle>
          <label
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              disabled && "pointer-events-none opacity-50",
              "cursor-pointer",
            )}
          >
            <ImagePlus data-icon="inline-start" />
            添加图片
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={disabled}
              onChange={onPickImages}
            />
          </label>
        </div>
        {mediaPaths.length === 0 ? (
          <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            选择本机图片
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {mediaPaths.map((path, index) => (
              <li
                key={`${path}-${index}`}
                className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
              >
                <img
                  src={localPathToFileUrl(path)}
                  alt=""
                  className="size-full object-cover"
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  disabled={disabled}
                  className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="移除图片"
                  onClick={() => {
                    removeAt(index);
                  }}
                >
                  <X />
                </Button>
                <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 text-xs text-white tabular-nums">
                  {index + 1}
                </span>
              </li>
            ))}
          </ul>
        )}
        <FieldDescription>按顺序组成轮播，至少一张</FieldDescription>
        {pathWarning ? (
          <Alert
            variant={pathWarning.tone === "error" ? "destructive" : "default"}
          >
            <AlertCircle />
            <AlertDescription>{pathWarning.text}</AlertDescription>
          </Alert>
        ) : null}
      </Field>

      <Field>
        <FieldLabel className="font-normal" htmlFor="graphic-body">
          文案
        </FieldLabel>
        <CharCountTextarea
          id="graphic-body"
          ref={bodyRef}
          placeholder="写一段配合图片的文案"
          max={effectiveBodyMax}
          disabled={disabled}
          value={body}
          className="min-h-32"
          onChange={(e) => {
            onBodyChange(e.target.value);
          }}
        />
      </Field>
    </FieldGroup>
  );
}
