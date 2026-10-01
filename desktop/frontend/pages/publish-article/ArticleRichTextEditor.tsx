import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Underline,
} from 'lucide-react';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { getLocalFilePath } from '@/lib/api';
import { getPugyingDesktopBridge } from '@/lib/agent-client';

/** 本机图片路径写入 data-local-path，随 HTML 一起保存。 */
const ArticleImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      localPath: {
        default: null,
        parseHTML: (element) => localImagePath(element),
        renderHTML: (attributes) => {
          if (!attributes.localPath) {
            return {};
          }
          return { 'data-local-path': attributes.localPath };
        },
      },
      previewData: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ArticleImageView);
  },
}).configure({ HTMLAttributes: { class: 'article-body-image' } });

function ArticleImageView({ node }: NodeViewProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const localPath = String(node.attrs.localPath || '');
  const previewData = String(node.attrs.previewData || '');
  const source = String(node.attrs.src || '');

  useEffect(() => {
    let active = true;
    setPreview(null);
    setFailed(false);
    if (previewData) {
      setPreview(previewData);
      setFailed(false);
      return () => {
        active = false;
      };
    }
    if (!localPath && /^(https?:|data:image\/|blob:)/i.test(source)) {
      setPreview(source);
      return () => {
        active = false;
      };
    }
    const bridge = getPugyingDesktopBridge();
    if (!localPath || !bridge?.readLocalImageDataUrl) {
      setFailed(true);
      return () => {
        active = false;
      };
    }
    void bridge
      .readLocalImageDataUrl(localPath)
      .then((dataUrl) => {
        if (active) {
          setPreview(dataUrl);
          setFailed(!dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [localPath, previewData, source]);

  return (
    <NodeViewWrapper className="my-3" contentEditable={false}>
      {preview ? (
        <img
          src={preview}
          alt={String(node.attrs.alt || '')}
          className="article-body-image mx-auto block max-h-80 max-w-full rounded-md"
          draggable={false}
          onError={() => {
            setPreview(null);
            setFailed(true);
          }}
        />
      ) : (
        <span className="text-sm text-muted-foreground">
          {failed ? '图片无法读取，请重新插入' : '正在加载图片…'}
        </span>
      )}
    </NodeViewWrapper>
  );
}

const ARTICLE_EDITOR_EXTENSIONS = [
  StarterKit.configure({ link: { openOnClick: false } }),
  ArticleImage,
  Placeholder.configure({
    placeholder: '从这里开始写正文…',
    showOnlyWhenEditable: false,
  }),
];

/** 文章正文编辑器：Tiptap 管理编辑状态，保存时仍输出 HTML。 */
export function ArticleRichTextEditor({
  id,
  value,
  onChange,
  onImagesInserted,
  disabled,
  minLength,
  maxLength,
  editorRef,
  footerExtra,
}: {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  onImagesInserted?: (paths: string[]) => void;
  disabled?: boolean;
  minLength: number;
  maxLength: number;
  editorRef?: RefObject<HTMLDivElement | null>;
  footerExtra?: ReactNode;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const insertionRangeRef = useRef<{ from: number; to: number }>({
    from: 1,
    to: 1,
  });
  const onChangeRef = useRef(onChange);
  const maxLengthRef = useRef(maxLength);
  const lastAcceptedHtmlRef = useRef(value || '');
  const lastExternalValueRef = useRef(value || '');
  const count = htmlToPlainText(value).length;
  const underMin = count > 0 && count < minLength;
  const overMax = count > maxLength;

  onChangeRef.current = onChange;
  maxLengthRef.current = maxLength;

  const editor = useEditor(
    {
      extensions: ARTICLE_EDITOR_EXTENSIONS,
      content: value || '',
      editable: !disabled,
      editorProps: {
        attributes: {
          ...(id ? { id } : {}),
          'data-slot': 'rich-text-control',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': '正文',
          'aria-placeholder': '从这里开始写正文…',
          class: cn(
            'min-h-48 w-full text-sm leading-6 outline-none focus-visible:outline-none md:text-sm',
            '[&_p]:my-2 [&_p:first-child]:mt-0',
            '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold',
            '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
            '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_a]:underline [&_a]:underline-offset-4',
            '[&_img]:mx-auto [&_img]:my-3 [&_img]:block [&_img]:max-h-80 [&_img]:max-w-full [&_img]:rounded-md',
          ),
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        const html = currentEditor.getHTML();
        if (htmlToPlainText(html).length > maxLengthRef.current) {
          currentEditor.commands.setContent(lastAcceptedHtmlRef.current, {
            emitUpdate: false,
          });
          return;
        }
        lastAcceptedHtmlRef.current = html;
        lastExternalValueRef.current = html;
        onChangeRef.current(html);
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || value === lastExternalValueRef.current) {
      return;
    }
    const html = value || '';
    lastExternalValueRef.current = html;
    lastAcceptedHtmlRef.current = html;
    if (editor.getHTML() !== html) {
      editor.commands.setContent(html, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const dom = editor.view.dom as HTMLDivElement;
    if (editorRef) {
      editorRef.current = dom;
    }
    return () => {
      if (editorRef?.current === dom) {
        editorRef.current = null;
      }
    };
  }, [editor, editorRef]);

  useEffect(() => {
    if (editor) {
      editor.view.dom.setAttribute('aria-invalid', String(underMin || overMax));
    }
  }, [editor, overMax, underMin]);

  const onPickImages = async (files: FileList | null) => {
    if (!files?.length || disabled || !editor) {
      return;
    }
    const imageFiles = Array.from(files).filter(
      (file) =>
        file.type.startsWith('image/') ||
        /\.(apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(file.name),
    );
    const imageSelections = imageFiles
      .map((file) => ({ file, path: getLocalFilePath(file) }))
      .filter((selection): selection is { file: File; path: string } =>
        Boolean(selection.path),
      );
    const paths = imageSelections.map((selection) => selection.path);

    if (paths.length === 0) {
      toast.add({
        type: 'error',
        title: '无法插入图片',
        description:
          imageFiles.length > 0
            ? '请在桌面应用中选择本机图片。'
            : '请选择图片文件。',
      });
      return;
    }

    const insertionRange = insertionRangeRef.current;
    let insertions;
    try {
      insertions = await Promise.all(
        imageSelections.map(async ({ file, path }) => ({
          type: 'image' as const,
          attrs: {
            src: toFileUrl(path),
            alt: '',
            localPath: path,
            previewData: await fileToDataUrl(file),
          },
        })),
      );
    } catch {
      toast.add({
        type: 'error',
        title: '图片读取失败',
        description: '请重新选择图片。',
      });
      return;
    }

    editor.chain().insertContentAt(insertionRange, insertions).focus().run();
    onImagesInserted?.(paths);
  };

  return (
    <div
      className={cn(
        'flex w-full flex-col overflow-hidden rounded-md border border-input shadow-xs dark:bg-input/30',
        'has-[[data-slot=rich-text-control]:focus-visible]:border-ring has-[[data-slot=rich-text-control]:focus-visible]:ring-3 has-[[data-slot=rich-text-control]:focus-visible]:ring-ring/50',
        (underMin || overMax) &&
          'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40',
        disabled && 'opacity-50',
      )}
    >
      <div
        role="toolbar"
        aria-label="正文格式"
        className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1"
      >
        <ToolbarButton
          label="加粗"
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="斜体"
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="下划线"
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <Underline />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-1 h-4" />
        <ToolbarButton
          label="小标题"
          disabled={disabled || !editor}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 />
        </ToolbarButton>
        <ToolbarButton
          label="引用"
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote />
        </ToolbarButton>
        <ToolbarButton
          label="无序列表"
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="有序列表"
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-1 h-4" />
        <ToolbarButton
          label="链接"
          disabled={disabled || !editor}
          onClick={() => {
            const url = window.prompt('链接地址');
            if (url?.trim()) {
              editor
                ?.chain()
                .focus()
                .extendMarkRange('link')
                .setLink({ href: url.trim() })
                .run();
            }
          }}
        >
          <LinkIcon />
        </ToolbarButton>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !editor}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            if (editor) {
              insertionRangeRef.current = {
                from: editor.state.selection.from,
                to: editor.state.selection.to,
              };
            }
            fileInputRef.current?.click();
          }}
        >
          <ImagePlus data-icon="inline-start" />
          插入图片
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            void onPickImages(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      <div className="px-2.5 py-2">
        <EditorContent editor={editor} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-2.5 py-1.5 text-xs text-muted-foreground">
        <span className={cn(underMin && 'text-destructive')}>
          {underMin
            ? `至少 ${minLength} 字，还差 ${minLength - count} 字`
            : footerExtra}
        </span>
        <span className={cn('tabular-nums', overMax && 'text-destructive')}>
          {count.toLocaleString('zh-CN')}/{maxLength.toLocaleString('zh-CN')}
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
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={label}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function toFileUrl(absPath: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(absPath)) {
    return `file:///${absPath.replace(/\\/g, '/')}`;
  }
  return `file://${absPath}`;
}

function localImagePath(element: HTMLElement): string | null {
  const localPath = element.getAttribute('data-local-path');
  if (localPath) {
    return localPath;
  }
  const source = element.getAttribute('src');
  if (!source?.startsWith('file:')) {
    return null;
  }
  try {
    const url = new URL(source);
    const path = decodeURIComponent(url.pathname);
    return /^\/[a-zA-Z]:\//.test(path) ? path.slice(1) : path;
  } catch {
    return null;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('图片读取失败'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

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

export function htmlToPlainText(html: string): string {
  if (!html.trim()) {
    return '';
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+\n/g, '\n').trim();
}
