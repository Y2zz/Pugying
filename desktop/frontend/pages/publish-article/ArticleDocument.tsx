import type { RefObject } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { CharCountInput } from '../publish-video/CharCountFields';
import { ArticleRichTextEditor } from './ArticleRichTextEditor';
import type { PathWarning } from './use-article-composer';

/**
 * 文章撰写区：标准 Field 表单（标题 + 富文本正文），与视频页通用信息一致。
 */
export function ArticleDocument({
  title,
  onTitleChange,
  titleMax,
  limitsActive,
  body,
  onBodyChange,
  bodyMin,
  bodyMax,
  pathWarning,
  disabled,
  titleRef,
  editorRef,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleMax: number;
  /** 已选账号时才按平台限制校验 */
  limitsActive: boolean;
  body: string;
  onBodyChange: (html: string) => void;
  bodyMin: number;
  bodyMax: number;
  pathWarning: PathWarning;
  disabled?: boolean;
  titleRef: RefObject<HTMLInputElement | null>;
  editorRef: RefObject<HTMLDivElement | null>;
}) {
  const effectiveTitleMax = limitsActive ? titleMax : Math.max(titleMax, 200);

  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor="article-title">标题</FieldLabel>
        <CharCountInput
          id="article-title"
          ref={titleRef}
          placeholder="填写文章标题"
          max={effectiveTitleMax}
          disabled={disabled}
          value={title}
          onChange={(e) => {
            onTitleChange(e.target.value.replace(/[\r\n]+/g, ' '));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editorRef.current?.focus();
            }
          }}
        />
      </Field>

      {pathWarning ? (
        <Alert variant={pathWarning.tone === 'error' ? 'destructive' : 'default'}>
          <AlertCircle />
          <AlertDescription>{pathWarning.text}</AlertDescription>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel htmlFor="article-body">正文</FieldLabel>
        <ArticleRichTextEditor
          id="article-body"
          value={body}
          onChange={onBodyChange}
          disabled={disabled}
          minLength={bodyMin}
          maxLength={bodyMax}
          editorRef={editorRef}
          footerExtra="图片引用本机文件，发布前请勿移动"
        />
        <FieldDescription>可插入本机图片；字数按所选平台最严限制计</FieldDescription>
      </Field>
    </FieldGroup>
  );
}
