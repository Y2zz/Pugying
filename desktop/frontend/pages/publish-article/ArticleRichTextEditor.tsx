import { useEffect, useRef } from 'react';
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getLocalFilePath } from '@/lib/api';
import { localPathToFileUrl } from './helpers';

/** 图文正文纯文字长度上下限（与 helpers 常量保持一致） */
const BODY_MIN = 200;
const BODY_MAX = 50_000;

/** 图文正文：轻量 contentEditable，存 HTML；插图带 data-local-path 供 mediaPaths 同步 */
export function ArticleRichTextEditor({
  value,
  onChange,
  onImagesInserted,
  disabled,
  className,
  maxLength = BODY_MAX,
  minLength = BODY_MIN,
}: {
  value: string;
  onChange: (html: string) => void;
  /** 从本机选图插入时回传绝对路径 */
  onImagesInserted?: (paths: string[]) => void;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
  minLength?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastExternalValue = useRef(value);
  const lastAcceptedHtml = useRef(value);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) {
      return;
    }
    // 仅在外部值变化时回写，避免打断输入法与光标
    if (value !== lastExternalValue.current && value !== el.innerHTML) {
      el.innerHTML = value || '';
      lastExternalValue.current = value;
      lastAcceptedHtml.current = value;
    }
  }, [value]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) {
      return;
    }
    const html = el.innerHTML;
    const len = htmlToPlainText(html).length;
    // 超上限时回滚到上次合法内容，避免粘贴一次撑破 5 万
    if (len > maxLength) {
      el.innerHTML = lastAcceptedHtml.current || '';
      lastExternalValue.current = lastAcceptedHtml.current;
      return;
    }
    lastAcceptedHtml.current = html;
    lastExternalValue.current = html;
    onChange(html);
  };

  const runCommand = (command: string, commandValue?: string) => {
    if (disabled) {
      return;
    }
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const onInsertLink = () => {
    if (disabled) {
      return;
    }
    const url = window.prompt('输入链接 URL');
    if (!url?.trim()) {
      return;
    }
    runCommand('createLink', url.trim());
  };

  const onPickImages = (files: FileList | null) => {
    if (!files?.length || disabled) {
      return;
    }
    const paths: string[] = [];
    const el = editorRef.current;
    el?.focus();
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        continue;
      }
      const path = getLocalFilePath(file);
      if (!path) {
        continue;
      }
      paths.push(path);
      const src = localPathToFileUrl(path);
      document.execCommand(
        'insertHTML',
        false,
        `<img src="${src}" data-local-path="${escapeAttr(path)}" alt="" />`,
      );
    }
    if (paths.length > 0) {
      onImagesInserted?.(paths);
      emitChange();
    }
  };

  const count = htmlToPlainText(value).length;
  const overMax = count > maxLength;
  const underMin = count > 0 && count < minLength;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-background',
        disabled ? 'opacity-60' : null,
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1 bg-muted/40 px-2 py-1.5">
        <ToolbarButton
          label="加粗"
          disabled={disabled}
          onClick={() => {
            runCommand('bold');
          }}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="斜体"
          disabled={disabled}
          onClick={() => {
            runCommand('italic');
          }}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="下划线"
          disabled={disabled}
          onClick={() => {
            runCommand('underline');
          }}
        >
          <Underline />
        </ToolbarButton>
        <ToolbarButton
          label="小标题"
          disabled={disabled}
          onClick={() => {
            runCommand('formatBlock', 'h2');
          }}
        >
          <Heading2 />
        </ToolbarButton>
        <ToolbarButton
          label="无序列表"
          disabled={disabled}
          onClick={() => {
            runCommand('insertUnorderedList');
          }}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="有序列表"
          disabled={disabled}
          onClick={() => {
            runCommand('insertOrderedList');
          }}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton label="链接" disabled={disabled} onClick={onInsertLink}>
          <LinkIcon />
        </ToolbarButton>
        <ToolbarButton
          label="插入本机图片"
          disabled={disabled}
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          <ImagePlus />
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            onPickImages(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline
        aria-label="正文"
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={cn(
          // 300px ≈ 18.75rem（16px 根字号）
          'min-h-[18.75rem] max-h-[min(40rem,70dvh)] overflow-y-auto px-3 py-2 text-sm outline-none',
          '[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold',
          '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
          '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_a]:text-primary [&_a]:underline',
          '[&_img]:my-2 [&_img]:max-h-64 [&_img]:rounded-md',
        )}
        onInput={emitChange}
        onBlur={emitChange}
      />
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          {underMin
            ? `至少 ${minLength} 字（还差 ${minLength - count}）`
            : `最少 ${minLength} 字 · 最多 ${maxLength.toLocaleString('zh-CN')} 字`}
        </span>
        <span className={cn(overMax || underMin ? 'text-destructive' : null)}>
          {count.toLocaleString('zh-CN')} / {maxLength.toLocaleString('zh-CN')}
        </span>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 从正文 HTML 中收集 data-local-path 图片路径 */
export function extractLocalImagePathsFromHtml(html: string): string[] {
  if (!html.trim()) {
    return [];
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const paths: string[] = [];
  for (const img of Array.from(doc.querySelectorAll('img[data-local-path]'))) {
    const path = img.getAttribute('data-local-path')?.trim();
    if (path) {
      paths.push(path);
    }
  }
  return paths;
}

/** 推送到抖音等平台时，把 HTML 压成纯文本描述 */
export function htmlToPlainText(html: string): string {
  if (!html.trim()) {
    return '';
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+\n/g, '\n').trim();
}
