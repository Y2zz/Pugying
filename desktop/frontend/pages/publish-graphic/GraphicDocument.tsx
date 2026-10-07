import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { AlertCircle, ImagePlus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { getLocalFilePath } from "@/lib/api";
import { useLocalImagePreview } from "@/hooks/use-local-image-preview";
import { cn } from "@/lib/utils";
import {
  CharCountInput,
  CharCountTextarea,
} from "../publish-video/CharCountFields";
import type { PathWarning } from "./use-graphic-composer";
import { ArticleImageEditDialog } from "../publish-article/ArticleImageEditDialog";
import {
  countArticleAccountTitleCharacters,
  normalizeArticleTitle,
} from "../publish-article/article-title";
import { graphicBodyPlainLength } from "./helpers";

/**
 * 图文撰写区：标题、文案与可排序的图片槽位。
 */
export function GraphicDocument({
  title,
  onTitleChange,
  titleMax,
  body,
  onBodyChange,
  bodyMin,
  bodyMax,
  mediaPaths,
  onMediaPathsChange,
  pathWarning,
  disabled,
  titleRef,
  validationAttempted = false,
  bodyValidationAttempted = false,
  imagesValidationAttempted = false,
  bodyRef,
  imagesRef,
  imageInputRef,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleMax: number;
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
  bodyValidationAttempted?: boolean;
  imagesValidationAttempted?: boolean;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
  imagesRef: RefObject<HTMLDivElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
}) {
  const [titleTouched, setTitleTouched] = useState(false);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    path: string;
    source: string;
    returnFocus: HTMLElement;
  } | null>(null);
  const currentPaths = useRef(mediaPaths);
  currentPaths.current = mediaPaths;
  const titleError =
    (titleTouched || validationAttempted) && !title.trim() ? "请填写标题" : "";

  const titleLength = countArticleAccountTitleCharacters(title);
  const bodyLength = graphicBodyPlainLength(body);
  const bodyError =
    (bodyLength > 0 || bodyValidationAttempted) && bodyLength < bodyMin
      ? bodyLength === 0
        ? "请填写文案"
        : `至少 ${bodyMin} 字，还差 ${bodyMin - bodyLength} 字`
      : "";
  const imagesErrorId = useId();
  const imagesError =
    imagesValidationAttempted && mediaPaths.length === 0
      ? "请至少选择一张图片"
      : "";
  const imagesInvalid = Boolean(imagesError) || pathWarning?.tone === "error";

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

  const moveImage = (fromPath: string, toPath: string) => {
    if (disabled || fromPath === toPath) {
      return;
    }
    const next = [...mediaPaths];
    const from = next.indexOf(fromPath);
    const to = next.indexOf(toPath);
    if (from < 0 || to < 0) {
      return;
    }
    next.splice(from, 1);
    next.splice(to, 0, fromPath);
    onMediaPathsChange(next);
  };

  const endDrag = () => {
    setDraggedPath(null);
    setDropPath(null);
  };

  return (
    <FieldGroup className="gap-4">
      <Field
        data-invalid={
          Boolean(titleError) || titleLength > titleMax || undefined
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
          max={titleMax}
          countCharacters={countArticleAccountTitleCharacters}
          disabled={disabled}
          value={title}
          onBlur={(event) => {
            setTitleTouched(true);
            onTitleChange(normalizeArticleTitle(event.target.value));
          }}
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

      <Field
        data-invalid={Boolean(bodyError) || bodyLength > bodyMax || undefined}
      >
        <FieldLabel className="font-normal" htmlFor="graphic-body">
          文案
        </FieldLabel>
        <CharCountTextarea
          id="graphic-body"
          ref={bodyRef}
          placeholder="写一段配合图片的文案"
          max={bodyMax}
          countCharacters={graphicBodyPlainLength}
          validationMessage={bodyError}
          disabled={disabled}
          value={body}
          className="min-h-32"
          onChange={(e) => {
            onBodyChange(e.target.value);
          }}
        />
      </Field>

      <Field ref={imagesRef} data-invalid={imagesInvalid || undefined}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldTitle className="font-normal">图片</FieldTitle>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,8rem)] gap-3">
          {mediaPaths.map((path, index) => (
            <li
              key={path}
              aria-label={`第 ${index + 1} 张图片`}
              draggable={!disabled && !editing}
              tabIndex={!disabled && !editing ? 0 : -1}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
              className={cn(
                "group relative aspect-square overflow-hidden rounded-md border bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                !disabled && "cursor-grab active:cursor-grabbing",
                draggedPath === path && "opacity-50",
                dropPath === path && "ring-2 ring-primary",
              )}
              onDragStart={(event) => {
                if (disabled || editing) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", path);
                setDraggedPath(path);
              }}
              onDragOver={(event) => {
                if (!draggedPath || disabled || editing) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropPath(path);
              }}
              onDragLeave={() => setDropPath(null)}
              onDrop={(event) => {
                if (!draggedPath || disabled || editing) {
                  return;
                }
                event.preventDefault();
                moveImage(draggedPath, path);
                endDrag();
              }}
              onDragEnd={endDrag}
              onKeyDown={(event) => {
                if (
                  disabled ||
                  editing ||
                  event.target !== event.currentTarget
                ) {
                  return;
                }
                const delta = {
                  ArrowLeft: -1,
                  ArrowUp: -1,
                  ArrowRight: 1,
                  ArrowDown: 1,
                }[event.key];
                if (!delta) {
                  return;
                }
                event.preventDefault();
                const target = mediaPaths[index + delta];
                if (target) {
                  moveImage(path, target);
                }
              }}
            >
              <GraphicImagePreview
                path={path}
                index={index}
                disabled={disabled}
                onEdit={(source, returnFocus) => {
                  setEditing({ path, source, returnFocus });
                }}
                onRemove={() => removeAt(index)}
              />
              <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 text-xs text-white tabular-nums">
                {index + 1}
              </span>
            </li>
          ))}
          <li className="aspect-square">
            <label
              className={cn(
                "flex size-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/40 text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-muted focus-within:ring-3 focus-within:ring-ring/50",
                imagesInvalid &&
                  "border-destructive hover:border-destructive focus-within:ring-destructive/20",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <ImagePlus className="size-5" aria-hidden />
              <span>添加图片</span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={disabled}
                aria-invalid={imagesInvalid || undefined}
                aria-describedby={
                  [
                    imagesError ? imagesErrorId : "",
                    pathWarning?.tone === "error"
                      ? `${imagesErrorId}-warning`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                onChange={onPickImages}
              />
            </label>
          </li>
        </ul>
        {imagesError ? (
          <FieldError id={imagesErrorId}>{imagesError}</FieldError>
        ) : null}
        <FieldDescription>
          拖动图片调整顺序，点击裁剪可编辑图片
        </FieldDescription>
        {pathWarning ? (
          <Alert
            id={
              pathWarning.tone === "error"
                ? `${imagesErrorId}-warning`
                : undefined
            }
            variant={pathWarning.tone === "error" ? "destructive" : "default"}
          >
            <AlertCircle />
            <AlertDescription>{pathWarning.text}</AlertDescription>
          </Alert>
        ) : null}
      </Field>

      {editing ? (
        <ArticleImageEditDialog
          title="编辑图片"
          allowZoom
          source={editing.source}
          localPath={editing.path}
          returnFocus={editing.returnFocus}
          onClose={() => setEditing(null)}
          onSaved={(nextPath) => {
            onMediaPathsChange(
              currentPaths.current.map((path) =>
                path === editing.path ? nextPath : path,
              ),
            );
            setEditing(null);
          }}
        />
      ) : null}
    </FieldGroup>
  );
}

function GraphicImagePreview({
  path,
  index,
  disabled,
  onEdit,
  onRemove,
}: {
  path: string;
  index: number;
  disabled?: boolean;
  onEdit: (source: string, returnFocus: HTMLElement) => void;
  onRemove: () => void;
}) {
  const source = useLocalImagePreview(path);
  const [failed, setFailed] = useState(false);

  const hasImage = Boolean(source && !failed);

  return (
    <>
      {hasImage ? (
        <img
          src={source!}
          alt=""
          draggable={false}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex size-full items-center justify-center p-2 text-center text-sm text-muted-foreground">
          {source === undefined ? "读取中…" : "图片无法显示，请重新选择"}
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-end justify-center gap-4 whitespace-nowrap bg-linear-to-t from-black/60 to-transparent pb-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {hasImage ? (
          <button
            type="button"
            disabled={disabled}
            className="pointer-events-auto cursor-pointer outline-none focus-visible:underline disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`裁剪第 ${index + 1} 张图片`}
            onClick={(event) => onEdit(source!, event.currentTarget)}
          >
            裁剪
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          className="pointer-events-auto cursor-pointer outline-none focus-visible:underline disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="移除图片"
          onClick={onRemove}
        >
          移除
        </button>
      </span>
    </>
  );
}
