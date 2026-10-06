import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Bold,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Underline,
  Undo2,
  Eye,
  FileUp,
  Maximize2,
  Minimize2,
} from "lucide-react";
import Image from "@tiptap/extension-image";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import { Input } from "@/components/ui/input";
import { ArticleImageEditDialog } from "./ArticleImageEditDialog";
import { ArticleLinkDialog } from "./ArticleLinkDialog";
import { cleanArticlePaste } from "./article-editor-paste";
import { clearArticleFormatting } from "./article-clear-format";
import { ArticleAlignment, ArticleTextStyle } from "./article-editor-format";
import { ArticleFormatPopover } from "./ArticleFormatPopover";
import { ArticleWritingSurface } from "./ArticleWritingSurface";
import {
  ArticleReadingPreview,
  type ArticlePreviewTarget,
} from "./ArticleReadingPreview";
import {
  ArticleDocumentImportError,
  articleImageToPng,
  importArticleDocument,
} from "./article-document-import";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Placeholder } from "@tiptap/extensions";
import {
  EditorContent,
  mergeAttributes,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  Extension,
  type NodeViewProps,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import { getLocalFilePath } from "@/lib/api";
import { getPugyingDesktopBridge } from "@/lib/agent-client";

/** 本机图片路径写入 data-local-path，随 HTML 一起保存。 */
const ArticleImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...Object.fromEntries(
        ["src", "alt", "title", "width", "height"].map((attribute) => [
          attribute,
          {
            default: null,
            parseHTML: (element: HTMLElement) =>
              (element.querySelector("img") || element).getAttribute(attribute),
          },
        ]),
      ),
      caption: {
        default: "",
        parseHTML: (element) =>
          element.closest("figure")?.querySelector("figcaption")?.textContent ||
          "",
        renderHTML: () => ({}),
      },
      localPath: {
        default: null,
        parseHTML: (element) =>
          localImagePath(element.querySelector("img") || element),
        renderHTML: (attributes) => {
          if (!attributes.localPath) {
            return {};
          }
          return { "data-local-path": attributes.localPath };
        },
      },
      previewData: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-article-image]",
        contentElement: "img",
        getAttrs: (element) => {
          const img = element.querySelector("img");
          if (!img) {
            return false;
          }
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt"),
            title: img.getAttribute("title"),
            localPath: localImagePath(img),
            caption: element.querySelector("figcaption")?.textContent || "",
          };
        },
      },
      { tag: 'img[src]:not([src^="data:"])' },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const image: [string, Record<string, unknown>] = [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ];
    return node.attrs.caption
      ? [
          "figure",
          { "data-article-image": "" },
          image,
          ["figcaption", {}, node.attrs.caption],
        ]
      : image;
  },
  addNodeView() {
    return ReactNodeViewRenderer(ArticleImageView);
  },
}).configure({ HTMLAttributes: { class: "article-body-image" } });

/** 图片边界始终可以回到正文；有相邻段落时直接使用它。 */
function focusImageText(
  editor: Editor,
  position: number,
  side: "before" | "after",
) {
  const image = editor.state.doc.nodeAt(position);
  if (!editor.isEditable || image?.type.name !== "image") {
    return;
  }
  const boundary = side === "before" ? position : position + image.nodeSize;
  const adjacent =
    side === "before"
      ? editor.state.doc.resolve(boundary).nodeBefore
      : editor.state.doc.resolve(boundary).nodeAfter;
  if (adjacent?.isTextblock) {
    editor
      .chain()
      .setTextSelection(side === "before" ? boundary - 1 : boundary + 1)
      .focus()
      .run();
  } else {
    editor
      .chain()
      .insertContentAt(boundary, { type: "paragraph" })
      .setTextSelection(boundary + 1)
      .focus()
      .run();
  }
}

function ArticleImageView({
  node,
  editor,
  selected,
  updateAttributes,
  getPos,
}: NodeViewProps) {
  const replacementRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectImage = () => {
    const pos = getPos();
    if (editor.isEditable && typeof pos === "number") {
      editor.chain().setNodeSelection(pos).focus().run();
    }
  };
  const replace = async (file: File | undefined) => {
    if (!file || !editor.isEditable || busy) {
      return;
    }
    const path = getLocalFilePath(file);
    if (!isImageFile(file) || !path) {
      toast.add({ type: "error", title: "请选择本机图片" });
      return;
    }
    setBusy(true);
    try {
      const data = await fileToDataUrl(file);
      if (
        !editor.isDestroyed &&
        editor.isEditable &&
        typeof getPos() === "number"
      ) {
        updateAttributes({
          src: toFileUrl(path),
          localPath: path,
          previewData: data,
          width: null,
          height: null,
        });
      }
    } catch {
      toast.add({ type: "error", title: "图片读取失败，请重新选择" });
    } finally {
      setBusy(false);
    }
  };
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const localPath = String(node.attrs.localPath || "");
  const previewData = String(node.attrs.previewData || "");
  const source = String(node.attrs.src || "");

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
    <NodeViewWrapper
      className="group relative my-3 rounded-md"
      contentEditable={false}
    >
      <div className="relative mx-auto w-fit max-w-full">
        {preview ? (
          <img
            src={preview}
            alt={String(node.attrs.alt || "")}
            className={cn(
              "article-body-image mx-auto block h-auto w-auto max-h-[min(25rem,60vh)] max-w-full object-contain rounded-md",
              selected && "ring-2 ring-ring",
            )}
            onClick={selectImage}
            draggable
            data-drag-handle
            onError={() => {
              setPreview(null);
              setFailed(true);
            }}
          />
        ) : (
          <span
            className="block min-h-12 text-sm text-muted-foreground"
            onClick={selectImage}
          >
            {failed ? "图片无法读取，请重新插入" : "正在加载图片…"}
          </span>
        )}
        {editor.isEditable ? (
          <div
            role="toolbar"
            aria-label="图片操作"
            className="article-editor-tools absolute bottom-3 left-1/2 z-10 flex w-max max-w-full -translate-x-1/2 flex-wrap items-center justify-center rounded-sm bg-black/65 px-1 text-white"
            onMouseDown={(event) => event.preventDefault()}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 font-normal text-white hover:bg-white/15 hover:text-white focus-visible:ring-white/60"
              aria-label="裁剪图片"
              disabled={!preview || busy}
              onClick={() => setEditing(true)}
            >
              裁剪
            </Button>
            <Separator
              orientation="vertical"
              className="h-3 bg-white/40 data-vertical:self-center"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 font-normal text-white hover:bg-white/15 hover:text-white focus-visible:ring-white/60"
              aria-label="替换图片"
              disabled={busy}
              onClick={() => replacementRef.current?.click()}
            >
              替换
            </Button>
            <Separator
              orientation="vertical"
              className="h-3 bg-white/40 data-vertical:self-center"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 font-normal text-white hover:bg-white/15 hover:text-white focus-visible:ring-white/60"
              aria-label="删除图片"
              disabled={busy}
              onClick={() => {
                const pos = getPos();
                if (typeof pos === "number") {
                  editor
                    .chain()
                    .setNodeSelection(pos)
                    .deleteSelection()
                    .focus()
                    .run();
                }
              }}
            >
              删除
            </Button>
            <input
              ref={replacementRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void replace(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        ) : null}
      </div>
      {editor.isEditable ? (
        <div className="mx-auto flex max-w-100 items-center gap-2 px-2 py-1">
          <Input
            aria-label="图片描述"
            placeholder="请输入图片描述（最多50字）"
            className="h-8 border-transparent text-center shadow-none focus-visible:border-input focus-visible:ring-0"
            value={String(node.attrs.caption || "")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                const position = getPos();
                if (typeof position === "number") {
                  focusImageText(editor, position, "after");
                }
              }
            }}
            onChange={(event) =>
              updateAttributes({
                caption: Array.from(event.target.value).slice(0, 50).join(""),
              })
            }
          />
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums text-muted-foreground",
              !selected && "opacity-0 group-focus-within:opacity-100",
            )}
          >
            {Array.from(String(node.attrs.caption || "")).length}/50
          </span>
        </div>
      ) : node.attrs.caption ? (
        <p className="text-center text-sm text-muted-foreground">
          {node.attrs.caption}
        </p>
      ) : null}
      {editor.isEditable
        ? (["before", "after"] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-label={
                side === "before" ? "在图片前输入正文" : "在图片后输入正文"
              }
              className={cn(
                "absolute inset-x-0 z-10 h-3 cursor-text rounded-sm opacity-0 hover:bg-primary/10 hover:opacity-100 focus-visible:bg-primary/10 focus-visible:opacity-100",
                side === "before" ? "-top-3" : "-bottom-3",
              )}
              onClick={() => {
                const position = getPos();
                if (typeof position === "number") {
                  focusImageText(editor, position, side);
                }
              }}
            />
          ))
        : null}
      {editing && preview ? (
        <ArticleImageEditDialog
          source={preview}
          returnFocus={editor.view.dom}
          localPath={localPath}
          onClose={() => setEditing(false)}
          onSaved={(path, data) => {
            if (
              !editor.isDestroyed &&
              editor.isEditable &&
              typeof getPos() === "number"
            ) {
              updateAttributes({
                src: toFileUrl(path),
                localPath: path,
                previewData: data,
                width: null,
                height: null,
              });
            }
            setEditing(false);
          }}
        />
      ) : null}
    </NodeViewWrapper>
  );
}

const ARTICLE_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    heading: { levels: [2, 3] },
    link: { openOnClick: false },
  }),
  ArticleImage,
  ArticleTextStyle,
  ArticleAlignment,
  Placeholder.configure({
    placeholder: "从这里开始写正文…",
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
  title = "",
  previewTargets = [],
  maxImages,
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
  title?: string;
  previewTargets?: ArticlePreviewTarget[];
  maxImages?: number;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importRangeRef = useRef<{ from: number; to: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inserting, setInserting] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");
  const [linkDialog, setLinkDialog] = useState<{ href: string } | null>(null);
  const linkRangeRef = useRef<{ from: number; to: number } | null>(null);
  const insertingRef = useRef(false);
  const importImagesRef = useRef<(files: File[], position?: number) => void>(
    () => {},
  );
  const pendingInteractionRef = useRef(false);
  const pendingRangeRef = useRef<{ from: number; to: number } | null>(null);
  const externalVersionRef = useRef(0);
  const insertionRangeRef = useRef<{ from: number; to: number }>({
    from: 1,
    to: 1,
  });
  const onChangeRef = useRef(onChange);
  const maxLengthRef = useRef(maxLength);
  const maxImagesRef = useRef(maxImages);
  const lastExternalValueRef = useRef(value || "");
  const count = htmlToPlainText(value).length;
  const underMin = count > 0 && count < minLength;
  const overMax = count > maxLength;

  onChangeRef.current = onChange;
  maxLengthRef.current = maxLength;
  maxImagesRef.current = maxImages;

  const editor = useEditor(
    {
      extensions: [
        ...ARTICLE_EDITOR_EXTENSIONS,
        Extension.create({
          name: "articleLengthLimit",
          addProseMirrorPlugins() {
            return [
              new Plugin({
                filterTransaction(transaction, state) {
                  if (
                    !transaction.docChanged ||
                    transaction.getMeta("preventUpdate")
                  ) {
                    return true;
                  }
                  const countText = (doc: typeof state.doc) => {
                    let text = "";
                    doc.descendants((node) => {
                      if (node.isText) {
                        text += node.text || "";
                      } else if (node.type.name === "image") {
                        text += String(node.attrs.caption || "");
                      }
                    });
                    return text.replace(/\s+\n/g, "\n").trim().length;
                  };
                  const nextCount = countText(transaction.doc);
                  const imageCount = (doc: typeof state.doc) => {
                    let count = 0;
                    doc.descendants((node) => {
                      if (node.type.name === "image") {
                        count += 1;
                      }
                    });
                    return count;
                  };
                  if (
                    maxImagesRef.current &&
                    imageCount(transaction.doc) > maxImagesRef.current &&
                    imageCount(transaction.doc) > imageCount(state.doc)
                  ) {
                    setLimitMessage(
                      `正文最多 ${maxImagesRef.current} 张图片，本次内容未添加`,
                    );
                    return false;
                  }
                  if (
                    nextCount > maxLengthRef.current &&
                    nextCount > countText(state.doc)
                  ) {
                    setLimitMessage(
                      `正文最多 ${maxLengthRef.current.toLocaleString("zh-CN")} 字，本次输入未添加`,
                    );
                    return false;
                  }
                  return true;
                },
              }),
            ];
          },
        }),
      ],
      content: value || "",
      editable: !disabled,
      onTransaction: ({ transaction }) => {
        const importRange = importRangeRef.current;
        if (importRange) {
          importRangeRef.current = {
            from: transaction.mapping.map(importRange.from),
            to: transaction.mapping.map(importRange.to),
          };
        }
        const linkRange = linkRangeRef.current;
        if (linkRange) {
          linkRangeRef.current = {
            from: transaction.mapping.map(linkRange.from),
            to: transaction.mapping.map(linkRange.to),
          };
        }
        const range = pendingRangeRef.current;
        if (range) {
          if (transaction.docChanged || transaction.selectionSet) {
            pendingInteractionRef.current = true;
          }
          pendingRangeRef.current = {
            from: transaction.mapping.map(range.from),
            to: transaction.mapping.map(range.to),
          };
        }
      },
      editorProps: {
        transformPastedHTML: (html) => {
          const cleaned = cleanArticlePaste(html, true);
          if (cleaned.simplified) {
            toast.add({
              type: "info",
              title: "已整理为基础图文格式，部分内容无法保留",
            });
          }
          return cleaned.html;
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files || []).filter(
            isImageFile,
          );
          if (!files.length) {
            return false;
          }
          importImagesRef.current(files);
          return true;
        },
        handleDrop: (view, event, moved) => {
          const files = Array.from(event.dataTransfer?.files || []).filter(
            isImageFile,
          );
          if (moved || !files.length) {
            return false;
          }
          const position = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos;
          importImagesRef.current(files, position);
          return true;
        },
        attributes: {
          ...(id ? { id } : {}),
          "data-slot": "rich-text-control",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "正文",
          "aria-placeholder": "从这里开始写正文…",
          class: cn(
            "min-h-48 w-full text-sm leading-6 outline-none focus-visible:outline-none md:text-sm",
            "[&_p]:my-2 [&_p:first-child]:mt-0",
            "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold",
            "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-border",
            "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
            "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_a]:underline [&_a]:underline-offset-4",
            "[&_img]:mx-auto [&_img]:my-3 [&_img]:block [&_img]:max-w-full [&_img]:rounded-md",
          ),
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        const html = currentEditor.getHTML();
        setLimitMessage("");
        lastExternalValueRef.current = html;
        onChangeRef.current(html);
      },
    },
    [],
  );

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      heading: current?.isActive("heading", { level: 2 }) ?? false,
      quote: current?.isActive("blockquote") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
      link: current?.isActive("link") ?? false,
      undo: current?.can().undo() ?? false,
      redo: current?.can().redo() ?? false,
      strike: current?.isActive("strike") ?? false,
      headingLevel: current?.isActive("heading")
        ? String(current.getAttributes("heading").level)
        : "paragraph",
      alignment: String(
        current?.getAttributes(
          current.isActive("heading") ? "heading" : "paragraph",
        ).textAlign || "left",
      ),
      color: String(current?.getAttributes("articleTextStyle").color || ""),
      backgroundColor: String(
        current?.getAttributes("articleTextStyle").backgroundColor || "",
      ),
    }),
  });

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const header = surface
      ?.closest("main")
      ?.querySelector<HTMLElement>('[data-slot="article-page-header-surface"]');
    if (!surface || !header || typeof ResizeObserver === "undefined") {
      return;
    }
    const update = () => {
      surface.style.setProperty(
        "--article-toolbar-top",
        `${header.getBoundingClientRect().height}px`,
      );
      if (toolbarRef.current) {
        surface.style.setProperty(
          "--article-toolbar-height",
          `${toolbarRef.current.getBoundingClientRect().height}px`,
        );
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    if (toolbarRef.current) {
      observer.observe(toolbarRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const onImportDocument = async (
    file: File | undefined,
    mode: "replace" | "append",
  ) => {
    if (!file || !editor?.isEditable || importing || inserting) {
      return;
    }
    const version = externalVersionRef.current;
    importRangeRef.current =
      mode === "replace"
        ? { from: 0, to: editor.state.doc.content.size }
        : {
            from: editor.state.doc.content.size,
            to: editor.state.doc.content.size,
          };
    setImporting(true);
    try {
      const result = await importArticleDocument(
        file,
        getLocalFilePath(file) || "",
        async (data, source) => {
          const save = getPugyingDesktopBridge()?.saveArticleImage;
          if (!save) {
            throw new ArticleDocumentImportError(
              "请从桌面应用导入含图片的文档",
            );
          }
          return save(data, source);
        },
      );
      if (
        !editor.isDestroyed &&
        editor.isEditable &&
        version === externalVersionRef.current &&
        importRangeRef.current
      ) {
        editor.commands.insertContentAt(importRangeRef.current, result.html, {
          updateSelection: false,
        });
        if (result.simplified) {
          toast.add({ type: "info", title: "已导入基础图文，部分内容已简化" });
        }
      }
    } catch (error) {
      toast.add({
        type: "error",
        title:
          error instanceof ArticleDocumentImportError
            ? error.message
            : "文档导入失败，请检查文件后重试",
      });
    } finally {
      importRangeRef.current = null;
      setImporting(false);
    }
  };

  const closeLinkDialog = () => {
    linkRangeRef.current = null;
    setLinkDialog(null);
  };

  const openLinkDialog = () => {
    if (!editor?.isEditable) {
      return;
    }
    if (editor.isActive("link")) {
      editor.commands.extendMarkRange("link");
    }
    linkRangeRef.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    setLinkDialog({ href: String(editor.getAttributes("link").href || "") });
  };

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(!disabled);
    if (disabled) {
      closeLinkDialog();
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || value === lastExternalValueRef.current) {
      return;
    }
    externalVersionRef.current += 1;
    const html = value || "";
    lastExternalValueRef.current = html;
    if (editor.getHTML() !== html) {
      closeLinkDialog();
      setLimitMessage("");
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
      editor.view.dom.setAttribute("aria-invalid", String(underMin || overMax));
    }
  }, [editor, overMax, underMin]);

  const onPickImages = async (files: File[] | FileList | null) => {
    if (!files?.length || disabled || !editor || insertingRef.current) {
      return;
    }
    const imageFiles = Array.from(files).filter(isImageFile);
    if (!imageFiles.length) {
      toast.add({ type: "error", title: "请选择图片文件" });
      return;
    }
    const version = externalVersionRef.current;
    pendingRangeRef.current = { ...insertionRangeRef.current };
    pendingInteractionRef.current = false;
    insertingRef.current = true;
    setInserting(true);
    try {
      const insertions = [];
      const paths: string[] = [];
      for (const file of imageFiles) {
        const previewData = await fileToDataUrl(file);
        let path = getLocalFilePath(file);
        if (!path && file.type.startsWith("image/")) {
          const save = getPugyingDesktopBridge()?.saveArticleImage;
          if (save) {
            path = (await save(await articleImageToPng(previewData), "")) || "";
            if (!path) {
              continue;
            }
          }
        }
        if (!path) {
          toast.add({ type: "error", title: "请选择本机图片" });
          continue;
        }
        paths.push(path);
        insertions.push({
          type: "image",
          attrs: {
            src: toFileUrl(path),
            alt: "",
            localPath: path,
            previewData,
          },
        });
      }
      if (
        editor.isDestroyed ||
        !editor.isEditable ||
        version !== externalVersionRef.current ||
        !pendingRangeRef.current ||
        !insertions.length
      ) {
        return;
      }
      const keepCursor = pendingInteractionRef.current;
      editor.commands.insertContentAt(pendingRangeRef.current, insertions, {
        updateSelection: !keepCursor,
      });
      if (!keepCursor) {
        const selection = editor.state.selection;
        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === "image"
        ) {
          focusImageText(editor, selection.from, "after");
        } else {
          editor.commands.focus();
        }
      }
      onImagesInserted?.(paths);
    } catch {
      toast.add({ type: "error", title: "图片读取失败，请重新选择" });
    } finally {
      pendingRangeRef.current = null;
      insertingRef.current = false;
      setInserting(false);
    }
  };
  importImagesRef.current = (files, position) => {
    if (!editor?.isEditable || insertingRef.current) {
      return;
    }
    insertionRangeRef.current =
      position === undefined
        ? { from: editor.state.selection.from, to: editor.state.selection.to }
        : { from: position, to: position };
    void onPickImages(files);
  };

  return (
    <ArticleWritingSurface
      focused={focused}
      onFocusedChange={(next) => {
        if (!previewOpen && !linkDialog && !pendingImport) {
          setFocused(next);
        }
      }}
    >
      <div
        className={cn(
          "article-editor-tools flex items-center justify-between gap-2",
          focused ? "border-b px-3 py-1.5" : "mb-2",
        )}
      >
        <FieldLabel htmlFor={id} className="font-normal">
          正文
        </FieldLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !editor || importing || inserting}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            importInputRef.current?.click();
          }}
        >
          <FileUp data-icon="inline-start" />
          {importing ? "正在导入…" : "导入文档"}
        </Button>
      </div>
      <div
        ref={surfaceRef}
        className={cn(
          "flex w-full flex-col overflow-clip rounded-md border border-input bg-background shadow-xs",
          focused && "min-h-0 flex-1 rounded-none border-0 shadow-none",
          (underMin || overMax) &&
            "border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40",
          disabled && "opacity-50",
        )}
      >
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="正文格式"
          className={cn(
            "article-editor-tools sticky z-20 flex flex-wrap items-center gap-0.5 border-b bg-background px-1.5 py-1",
            focused ? "top-0" : "top-[var(--article-toolbar-top,0px)]",
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-0.5">
            <ToolbarButton
              label="撤销"
              shortcut="⌘/Ctrl+Z"
              disabled={disabled || !toolbarState?.undo || inserting}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              <Undo2 />
            </ToolbarButton>
            <ToolbarButton
              label="重做"
              shortcut="⌘/Ctrl+Shift+Z"
              disabled={disabled || !toolbarState?.redo || inserting}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              <Redo2 />
            </ToolbarButton>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 data-vertical:self-center"
            />
            <NativeSelect
              size="sm"
              aria-label="段落样式"
              value={toolbarState?.headingLevel || "paragraph"}
              disabled={disabled || !editor}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "paragraph") {
                  editor?.chain().focus().setParagraph().run();
                } else {
                  editor
                    ?.chain()
                    .focus()
                    .setHeading({ level: Number(value) as 2 | 3 })
                    .run();
                }
              }}
            >
              <NativeSelectOption value="paragraph">正文</NativeSelectOption>
              <NativeSelectOption value="2">标题</NativeSelectOption>
              <NativeSelectOption value="3">小标题</NativeSelectOption>
            </NativeSelect>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 data-vertical:self-center"
            />
            <ToolbarButton
              label="加粗"
              pressed={toolbarState?.bold ?? false}
              shortcut="⌘/Ctrl+B"
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold />
            </ToolbarButton>
            <ToolbarButton
              label="斜体"
              pressed={toolbarState?.italic ?? false}
              shortcut="⌘/Ctrl+I"
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic />
            </ToolbarButton>
            <ToolbarButton
              label="下划线"
              pressed={toolbarState?.underline ?? false}
              shortcut="⌘/Ctrl+U"
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              <Underline />
            </ToolbarButton>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 data-vertical:self-center"
            />
            <ToolbarButton
              label="无序列表"
              pressed={toolbarState?.bulletList ?? false}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List />
            </ToolbarButton>
            <ToolbarButton
              label="有序列表"
              pressed={toolbarState?.orderedList ?? false}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered />
            </ToolbarButton>
            <ToolbarButton
              label="引用"
              pressed={toolbarState?.quote ?? false}
              disabled={disabled || !editor}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <Quote />
            </ToolbarButton>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 data-vertical:self-center"
            />
            <ToolbarButton
              label={inserting ? "正在插入…" : "插入图片"}
              disabled={disabled || !editor || inserting}
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
              <ImagePlus />
            </ToolbarButton>
            <ToolbarButton
              label="链接"
              pressed={toolbarState?.link ?? false}
              disabled={disabled || !editor}
              onClick={openLinkDialog}
            >
              <LinkIcon />
            </ToolbarButton>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 data-vertical:self-center"
            />
            <ToolbarButton
              label="清除格式"
              description="清除选区格式；未选中时清除全文格式，保留图片"
              disabled={
                disabled ||
                !editor ||
                editor.state.selection instanceof NodeSelection
              }
              onClick={() => {
                if (editor) {
                  clearArticleFormatting(editor);
                }
              }}
            >
              <RemoveFormatting />
            </ToolbarButton>
            <ArticleFormatPopover
              editor={editor}
              disabled={disabled || !editor}
              state={
                toolbarState || {
                  strike: false,
                  alignment: "left",
                  color: "",
                  backgroundColor: "",
                }
              }
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={disabled}
              onChange={(event) => {
                void onPickImages(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              ref={importInputRef}
              type="file"
              accept=".md,.markdown,.html,.htm,.txt,.docx"
              aria-label="选择导入文档"
              disabled={disabled || importing || inserting}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && editor?.isEditable && !importing && !inserting) {
                  if (editor.isEmpty) {
                    void onImportDocument(file, "replace");
                  } else {
                    setPendingImport(file);
                  }
                }
                event.target.value = "";
              }}
            />
          </div>
          <div
            role="group"
            aria-label="文章视图"
            className="ml-auto flex shrink-0 items-center gap-0.5"
          >
            <Separator
              orientation="vertical"
              className="mx-1 h-4 data-vertical:self-center"
            />
            <ToolbarButton
              label="阅读预览"
              disabled={!editor}
              onClick={() => setPreviewOpen(true)}
            >
              <Eye />
            </ToolbarButton>
            <ToolbarButton
              label={focused ? "退出专注写作" : "专注写作"}
              disabled={!editor}
              onClick={() => setFocused((value) => !value)}
            >
              {focused ? <Minimize2 /> : <Maximize2 />}
            </ToolbarButton>
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col md:flex-row",
            focused && "flex-1 overflow-y-auto",
          )}
        >
          <div
            className={cn(
              "min-w-0 flex-1 px-2.5 py-2",
              focused && "mx-auto max-w-4xl px-6 py-4",
            )}
          >
            <EditorContent editor={editor} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-2.5 py-1.5 text-xs text-muted-foreground">
          <span
            className={cn((underMin || limitMessage) && "text-destructive")}
          >
            {limitMessage ||
              (underMin
                ? `至少 ${minLength} 字，还差 ${minLength - count} 字`
                : footerExtra)}
          </span>
          <span className={cn("tabular-nums", overMax && "text-destructive")}>
            {count.toLocaleString("zh-CN")}/{maxLength.toLocaleString("zh-CN")}
            {maxImages
              ? ` · ${(value.match(/<img\b/gi) || []).length}/${maxImages} 张图片`
              : ""}
          </span>
        </div>
        {limitMessage ? (
          <span role="status" className="sr-only">
            {limitMessage}
          </span>
        ) : null}
        {previewOpen ? (
          <ArticleReadingPreview
            title={title}
            body={value}
            targets={previewTargets}
            onClose={() => setPreviewOpen(false)}
            returnFocus={editor?.view.dom}
          />
        ) : null}
        <Dialog
          open={pendingImport !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingImport(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>如何导入文档？</DialogTitle>
              <DialogDescription>
                正文已有内容。覆盖将替换现有正文，追加将添加到正文末尾。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPendingImport(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled || importing || inserting}
                onClick={() => {
                  const file = pendingImport;
                  setPendingImport(null);
                  if (file) {
                    void onImportDocument(file, "replace");
                  }
                }}
              >
                覆盖
              </Button>
              <Button
                type="button"
                disabled={disabled || importing || inserting}
                onClick={() => {
                  const file = pendingImport;
                  setPendingImport(null);
                  if (file) {
                    void onImportDocument(file, "append");
                  }
                }}
              >
                追加
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {editor && linkDialog ? (
          <ArticleLinkDialog
            href={linkDialog.href}
            returnFocus={editor.view.dom}
            onClose={closeLinkDialog}
            onConfirm={(href) => {
              const range = linkRangeRef.current;
              if (!range || !editor.isEditable) {
                return;
              }
              const chain = editor.chain().setTextSelection(range).focus();
              if (range.from === range.to) {
                chain
                  .insertContent({
                    type: "text",
                    text: href,
                    marks: [{ type: "link", attrs: { href } }],
                  })
                  .unsetMark("link")
                  .run();
              } else {
                chain.setLink({ href }).run();
              }
              closeLinkDialog();
            }}
            onRemove={
              linkDialog.href
                ? () => {
                    const range = linkRangeRef.current;
                    if (range && editor.isEditable) {
                      editor
                        .chain()
                        .setTextSelection(range)
                        .focus()
                        .unsetLink()
                        .run();
                    }
                    closeLinkDialog();
                  }
                : undefined
            }
          />
        ) : null}
      </div>
    </ArticleWritingSurface>
  );
}

function ToolbarButton({
  label,
  shortcut,
  description,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  description?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          pressed !== undefined ? (
            <Toggle
              size="sm"
              className="size-8 p-0"
              pressed={pressed}
              disabled={disabled}
              aria-label={label}
              onMouseDown={(event) => event.preventDefault()}
              onPressedChange={onClick}
            />
          ) : (
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
          )
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {description || label}
        {shortcut ? ` (${shortcut})` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function toFileUrl(absPath: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(absPath)) {
    return `file:///${absPath.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/")}`;
  }
  return `file://${absPath.split("/").map(encodeURIComponent).join("/")}`;
}

function localImagePath(element: HTMLElement): string | null {
  const localPath = element.getAttribute("data-local-path");
  if (localPath) {
    return localPath;
  }
  const source = element.getAttribute("src");
  if (!source?.startsWith("file:")) {
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
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("图片读取失败"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export function extractLocalImagePathsFromHtml(html: string): string[] {
  if (!html.trim()) {
    return [];
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paths: string[] = [];
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const path = localImagePath(img)?.trim();
    if (path) {
      paths.push(path);
    }
  }
  return paths;
}

export function htmlToPlainText(html: string): string {
  if (!html.trim()) {
    return "";
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+\n/g, "\n").trim();
}

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(file.name)
  );
}
