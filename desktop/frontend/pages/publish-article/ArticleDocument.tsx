import { useState, type RefObject } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { CharCountInput } from "../publish-video/CharCountFields";
import { ArticleRichTextEditor } from "./ArticleRichTextEditor";
import type { ArticlePreviewTarget } from "./ArticleReadingPreview";
import type { PathWarning } from "./use-article-composer";
import {
  countArticleTitleCharacters,
  normalizeArticleTitle,
} from "./article-title";

/**
 * 文章撰写区：标准 Field 表单（标题 + 富文本正文），与视频页通用信息一致。
 */
export function ArticleDocument({
  title,
  onTitleChange,
  titleMax,
  body,
  onBodyChange,
  bodyMin,
  bodyMax,
  pathWarning,
  disabled,
  titleRef,
  validationAttempted = false,
  editorRef,
  imageWarningRef,
  previewTargets,
  maxImages,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleMax: number;
  body: string;
  onBodyChange: (html: string) => void;
  bodyMin: number;
  bodyMax: number;
  pathWarning: PathWarning;
  disabled?: boolean;
  titleRef: RefObject<HTMLInputElement | null>;
  validationAttempted?: boolean;
  editorRef: RefObject<HTMLDivElement | null>;
  imageWarningRef?: RefObject<HTMLDivElement | null>;
  previewTargets?: ArticlePreviewTarget[];
  maxImages?: number;
}) {
  const [titleTouched, setTitleTouched] = useState(false);
  const titleError =
    (titleTouched || validationAttempted) && !title.trim() ? "请填写标题" : "";

  return (
    <FieldGroup className="gap-4">
      <Field
        data-invalid={
          Boolean(titleError) ||
          countArticleTitleCharacters(title) > titleMax ||
          undefined
        }
      >
        <FieldLabel htmlFor="article-title" className="font-normal">
          标题
        </FieldLabel>
        <CharCountInput
          id="article-title"
          ref={titleRef}
          validationMessage={titleError}
          placeholder="填写文章标题"
          max={titleMax}
          countCharacters={countArticleTitleCharacters}
          disabled={disabled}
          value={title}
          onChange={(e) => {
            onTitleChange(e.target.value.replace(/[\r\n]+/g, " "));
          }}
          onBlur={(e) => {
            setTitleTouched(true);
            onTitleChange(normalizeArticleTitle(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editorRef.current?.focus();
            }
          }}
        />
      </Field>

      {pathWarning ? (
        <Alert
          ref={imageWarningRef}
          variant={pathWarning.tone === "error" ? "destructive" : "default"}
        >
          <AlertCircle />
          <AlertDescription>{pathWarning.text}</AlertDescription>
        </Alert>
      ) : null}

      <Field>
        <ArticleRichTextEditor
          id="article-body"
          value={body}
          onChange={onBodyChange}
          disabled={disabled}
          minLength={bodyMin}
          maxLength={bodyMax}
          editorRef={editorRef}
          footerExtra="图片引用本机文件，发布前请勿移动"
          title={title}
          previewTargets={previewTargets}
          maxImages={maxImages}
        />
        <FieldDescription>
          可插入本机图片；字数按所选平台最严限制计
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
