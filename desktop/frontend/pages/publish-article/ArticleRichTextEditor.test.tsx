// @vitest-environment jsdom
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ArticleRichTextEditor,
  extractLocalImagePathsFromHtml,
} from "./ArticleRichTextEditor";

const documentImport = vi.hoisted(() => vi.fn());
vi.mock("./article-document-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./article-document-import")>()),
  importArticleDocument: documentImport,
}));

const imagePath = "/tmp/正文图片.png";
const preview = "data:image/png;base64,aW1hZ2U=";

function ControlledEditor({
  initialHtml = "<p>正文</p>",
  maxLength = 50000,
  maxImages,
}: {
  initialHtml?: string;
  maxLength?: number;
  maxImages?: number;
}) {
  const [value, setValue] = useState(initialHtml);
  return (
    <TooltipProvider>
      <ArticleRichTextEditor
        value={value}
        onChange={setValue}
        minLength={0}
        maxLength={maxLength}
        maxImages={maxImages}
      />
    </TooltipProvider>
  );
}

beforeEach(() => {
  documentImport
    .mockReset()
    .mockResolvedValue({ html: "<p>导入正文</p>", simplified: false });
  vi.stubGlobal("pugyingDesktop", {
    available: true,
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    getPathForFile: vi.fn(() => imagePath),
    readLocalImageDataUrl: vi.fn().mockResolvedValue(preview),
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  });
});

it("reflects format selection and enables undo and redo as history changes", () => {
  render(<ControlledEditor />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  expect(
    screen.getByRole("button", { name: "撤销" }).hasAttribute("disabled"),
  ).toBe(true);
  act(() => body.editor.commands.setTextSelection({ from: 1, to: 3 }));
  fireEvent.click(screen.getByRole("button", { name: "加粗" }));
  expect(
    screen.getByRole("button", { name: "加粗" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(body.editor.getHTML()).toContain("<strong>正文</strong>");
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(body.editor.getHTML()).toBe("<p>正文</p>");
  expect(
    screen.getByRole("button", { name: "加粗" }).getAttribute("aria-pressed"),
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "重做" }));
  expect(body.editor.getHTML()).toContain("<strong>正文</strong>");
});

it("clears formatting across paragraphs without deleting images or captions", () => {
  render(
    <ControlledEditor
      initialHtml={`<h2><strong>前文</strong></h2><figure data-article-image><img src="file://${imagePath}" data-local-path="${imagePath}"><figcaption>说明</figcaption></figure><blockquote><p><em>后文</em></p></blockquote>`}
    />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => body.editor.commands.selectAll());
  fireEvent.click(screen.getByRole("button", { name: "清除格式" }));
  expect(body.editor.getHTML()).toContain("<p>前文</p>");
  expect(body.editor.getHTML()).toContain("<p>后文</p>");
  expect(body.editor.getHTML()).not.toContain("blockquote");
  expect(body.editor.getHTML()).toContain("<figcaption>说明</figcaption>");
  expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([
    imagePath,
  ]);
});

it("edits and removes an existing link while keeping its text", async () => {
  render(
    <ControlledEditor initialHtml='<p>前<a href="https://example.com">链接</a>后</p>' />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => body.editor.commands.setTextSelection(3));
  fireEvent.click(screen.getByRole("button", { name: "链接" }));
  expect(
    (screen.getByRole("textbox", { name: "链接地址" }) as HTMLInputElement)
      .value,
  ).toBe("https://example.com");
  fireEvent.change(screen.getByRole("textbox", { name: "链接地址" }), {
    target: { value: "example.org/new" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  expect(body.editor.getHTML()).toContain('href="https://example.org/new"');
  expect(body.editor.getText()).toBe("前链接后");
  act(() => body.editor.commands.setTextSelection(3));
  fireEvent.click(screen.getByRole("button", { name: "链接" }));
  fireEvent.click(screen.getByRole("button", { name: "移除链接" }));
  expect(body.editor.getHTML()).toBe("<p>前链接后</p>");
});

it("inserts a URL at the cursor and rejects unsafe link addresses", () => {
  render(<ControlledEditor initialHtml="<p></p>" />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.click(screen.getByRole("button", { name: "链接" }));
  fireEvent.change(screen.getByRole("textbox", { name: "链接地址" }), {
    target: { value: "javascript:alert(1)" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  expect(screen.getByRole("alert").textContent).toBe("请输入有效的网页链接");
  expect(body.editor.getText()).toBe("");
  fireEvent.change(screen.getByRole("textbox", { name: "链接地址" }), {
    target: { value: "https://example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  expect(body.editor.getHTML()).toContain('href="https://example.com/"');
  expect(body.editor.getText()).toBe("https://example.com/");
});

it("rejects over-limit input without resetting the document or losing undo history", () => {
  render(<ControlledEditor maxLength={4} />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => {
    body.editor.commands.setTextSelection(3);
    body.editor.commands.insertContent("补");
  });
  act(() => body.editor.commands.insertContent("超过上限"));
  expect(body.editor.getText()).toBe("正文补");
  expect(screen.getByRole("status").textContent).toContain("本次输入未添加");
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(body.editor.getText()).toBe("正文");
  fireEvent.click(screen.getByRole("button", { name: "重做" }));
  expect(body.editor.getText()).toBe("正文补");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("inserts a local image and restores its preview from saved HTML without embedding image bytes", async () => {
  const first = render(<ControlledEditor />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => {
    body.editor.commands.setTextSelection(3);
  });
  fireEvent.click(screen.getByRole("button", { name: "插入图片" }));
  const input = first.container.querySelector("input[type=file]")!;
  fireEvent.change(input, {
    target: {
      files: [new File(["image"], "正文图片.png", { type: "image/png" })],
    },
  });

  await waitFor(() => {
    expect(first.container.querySelector("img")?.getAttribute("src")).toBe(
      preview,
    );
  });
  const savedHtml = body.editor.getHTML();
  expect(extractLocalImagePathsFromHtml(savedHtml)).toEqual([imagePath]);
  expect(savedHtml).toContain("正文");
  expect(savedHtml).not.toContain("base64");
  expect(savedHtml).not.toContain("previewData");
  first.unmount();

  const reopened = render(<ControlledEditor initialHtml={savedHtml} />);
  await waitFor(() => {
    expect(reopened.container.querySelector("img")?.getAttribute("src")).toBe(
      preview,
    );
  });
  expect(globalThis.pugyingDesktop.readLocalImageDataUrl).toHaveBeenCalledWith(
    imagePath,
  );
});

it("shows a readable message when a saved image cannot be read", async () => {
  vi.mocked(globalThis.pugyingDesktop.readLocalImageDataUrl).mockRejectedValue(
    new Error("missing file"),
  );
  render(
    <ControlledEditor
      initialHtml={`<p>正文</p><img src="file://${imagePath}" data-local-path="${imagePath}">`}
    />,
  );
  await screen.findByText("图片无法读取，请重新插入");
});

it("persists image captions as visible HTML and restores them without duplicating the image", async () => {
  const first = render(
    <ControlledEditor
      initialHtml={`<p>正文</p><img src="file://${imagePath}" data-local-path="${imagePath}">`}
    />,
  );
  await waitFor(() =>
    expect(first.container.querySelector("img")).not.toBeNull(),
  );
  fireEvent.click(first.container.querySelector("img")!);
  fireEvent.change(screen.getByRole("textbox", { name: "图片描述" }), {
    target: { value: "一张图片 🌼" },
  });
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  const saved = body.editor.getHTML();
  expect(saved).toContain("<figcaption>一张图片 🌼</figcaption>");
  expect(extractLocalImagePathsFromHtml(saved)).toEqual([imagePath]);
  first.unmount();
  const second = render(<ControlledEditor initialHtml={saved} />);
  await waitFor(() =>
    expect(second.container.querySelector("img")?.getAttribute("src")).toBe(
      preview,
    ),
  );
  expect(second.container.querySelectorAll("img")).toHaveLength(1);
  expect(
    (screen.getByRole("textbox", { name: "图片描述" }) as HTMLInputElement)
      .value,
  ).toBe("一张图片 🌼");
  const restored = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  expect(restored.editor.getHTML()).toContain(
    "<figcaption>一张图片 🌼</figcaption>",
  );
});

it("limits captions to 50 Unicode characters and supports deleting and undoing an image", async () => {
  const view = render(
    <ControlledEditor
      initialHtml={`<p>正文</p><img src="file://${imagePath}" data-local-path="${imagePath}">`}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector("img")).not.toBeNull(),
  );
  fireEvent.click(view.container.querySelector("img")!);
  fireEvent.change(screen.getByRole("textbox", { name: "图片描述" }), {
    target: { value: "🌼".repeat(51) },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: "图片描述" }) as HTMLInputElement)
        .value,
    ).toBe("🌼".repeat(50)),
  );
  fireEvent.click(screen.getByRole("button", { name: "删除图片" }));
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([]);
  act(() => {
    body.editor.commands.undo();
  });
  expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([
    imagePath,
  ]);
});

it("replaces the selected image while keeping its caption and the surrounding article", async () => {
  const view = render(
    <ControlledEditor
      initialHtml={`<p>前文</p><figure data-article-image><img src="file://${imagePath}" data-local-path="${imagePath}"><figcaption>说明</figcaption></figure><p>后文</p>`}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector("img")).not.toBeNull(),
  );
  fireEvent.click(view.container.querySelector("img")!);
  vi.mocked(globalThis.pugyingDesktop.getPathForFile!).mockReturnValue(
    "/tmp/替换 #1.png",
  );
  const input = (
    await screen.findByRole("toolbar", { name: "图片操作" })
  ).querySelector("input")!;
  fireEvent.change(input, {
    target: {
      files: [new File(["new image"], "new.png", { type: "image/png" })],
    },
  });
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  await waitFor(() =>
    expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([
      "/tmp/替换 #1.png",
    ]),
  );
  expect(body.editor.getHTML()).toContain("前文");
  expect(body.editor.getHTML()).toContain("后文");
  expect(body.editor.getHTML()).toContain("<figcaption>说明</figcaption>");
  expect(body.editor.getHTML()).toContain("%231.png");
  expect(body.editor.getHTML()).not.toContain("base64");
});

it("imports a pasted local image at the current selection", async () => {
  render(<ControlledEditor />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.paste(body, {
    clipboardData: {
      files: [new File(["image"], "paste.png", { type: "image/png" })],
      getData: () => "",
    },
  });
  await waitFor(() =>
    expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([
      imagePath,
    ]),
  );
});

it("allows typing before the first image and after it without selecting the caption", async () => {
  render(
    <ControlledEditor
      initialHtml={`<img src="file://${imagePath}" data-local-path="${imagePath}">`}
    />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.click(screen.getByRole("button", { name: "在图片前输入正文" }));
  act(() => {
    body.editor.commands.insertContent("前文");
  });
  fireEvent.click(screen.getByRole("button", { name: "在图片后输入正文" }));
  act(() => {
    body.editor.commands.insertContent("后文");
  });
  expect(body.editor.getHTML()).toMatch(/<p>前文<\/p><img[^>]+><p>后文<\/p>/);
});

it("continues typing after multiple inserted images and supports undo and redo", async () => {
  const view = render(<ControlledEditor initialHtml="<p></p>" />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.click(screen.getByRole("button", { name: "插入图片" }));
  fireEvent.change(view.container.querySelector("input[type=file]")!, {
    target: {
      files: [
        new File(["1"], "1.png", { type: "image/png" }),
        new File(["2"], "2.png", { type: "image/png" }),
      ],
    },
  });
  await waitFor(() =>
    expect(view.container.querySelectorAll("img")).toHaveLength(2),
  );
  expect(body.editor.state.selection.$from.parent.isTextblock).toBe(true);
  act(() => {
    body.editor.commands.insertContent("继续写正文");
  });
  expect(body.editor.getHTML()).toMatch(
    /<img[^>]+><img[^>]+><p>继续写正文<\/p>/,
  );
  act(() => {
    body.editor.commands.undo();
    body.editor.commands.redo();
  });
  expect(body.editor.getHTML()).toContain("继续写正文");
});

it("moves from a selected image into the following paragraph with Enter", async () => {
  const view = render(
    <ControlledEditor
      initialHtml={`<p>前文</p><img src="file://${imagePath}" data-local-path="${imagePath}"><p>后文</p>`}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector("img")).not.toBeNull(),
  );
  fireEvent.click(view.container.querySelector("img")!);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.keyDown(body, { key: "Enter", code: "Enter" });
  expect(body.editor.state.selection.$from.parent.isTextblock).toBe(true);
  act(() => {
    body.editor.commands.insertContent("补充");
  });
  expect(body.editor.getHTML()).toContain("前文");
  expect(body.editor.getHTML()).toContain("后文");
  expect(body.editor.getHTML()).toContain("补充");
});

it("preserves ongoing typing when an image finishes reading asynchronously", async () => {
  const view = render(
    <ControlledEditor initialHtml="<p>前文</p><p>后文</p>" />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => {
    body.editor.commands.setTextSelection(3);
  });
  fireEvent.click(screen.getByRole("button", { name: "插入图片" }));
  fireEvent.change(view.container.querySelector("input[type=file]")!, {
    target: { files: [new File(["image"], "1.png", { type: "image/png" })] },
  });
  act(() => {
    body.editor.commands.setTextSelection(7);
    body.editor.commands.insertContent("继续");
  });
  await waitFor(() =>
    expect(view.container.querySelector("img")).not.toBeNull(),
  );
  expect(body.editor.state.selection.$from.parent.textContent).toBe("后文继续");
  act(() => {
    body.editor.commands.insertContent("输入");
  });
  expect(body.editor.getHTML()).toContain("后文继续输入");
});

it("returns from the caption to article text on Enter without submitting", async () => {
  render(
    <ControlledEditor
      initialHtml={`<img src="file://${imagePath}" data-local-path="${imagePath}"><p>后文</p>`}
    />,
  );
  const caption = screen.getByRole("textbox", { name: "图片描述" });
  caption.focus();
  fireEvent.change(caption, { target: { value: "图片描述" } });
  fireEvent.keyDown(caption, { key: "Enter" });
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => {
    body.editor.commands.insertContent("继续");
  });
  expect(body.editor.getHTML()).toContain("<p>继续后文</p>");
  expect(body.editor.getHTML()).toContain("<figcaption>图片描述</figcaption>");
});

it("pastes structured HTML as editable basic text and preserves undo", () => {
  render(<ControlledEditor initialHtml="<p></p>" />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.paste(body, {
    clipboardData: {
      files: [],
      getData: (type: string) =>
        type === "text/html"
          ? '<h1 style="color:red">标题</h1><p><span style="font-weight:700">重点</span></p><ul><li>条目</li></ul>'
          : "",
    },
  });
  expect(body.editor.getHTML()).toContain("<h2>标题</h2>");
  expect(body.editor.getHTML()).toContain("<strong>重点</strong>");
  expect(body.editor.getHTML()).toContain("<ul><li><p>条目</p></li></ul>");
  expect(body.editor.getHTML()).not.toContain("style=");
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(body.editor.getText()).toBe("");
});

it("keeps permitted styles and heading structure after reloading saved HTML", () => {
  render(
    <ControlledEditor initialHtml='<h3 style="text-align: center"><span style="color: #b91c1c; font-size: 18px">小标题</span></h3><p><s>删除线</s></p><hr><p>正文</p>' />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  expect(body.editor.getHTML()).toContain("text-align: center");
  expect(body.editor.getHTML()).toContain("font-size: 18px");
  expect(body.editor.getHTML()).toContain("<s>删除线</s>");
  expect(body.editor.getHTML()).toContain("<hr>");
});

it("applies limited text styles and paragraph alignment to the selected text", async () => {
  render(<ControlledEditor />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => body.editor.commands.setTextSelection({ from: 1, to: 3 }));
  fireEvent.click(screen.getByRole("button", { name: "更多格式" }));
  await screen.findByRole("combobox", { name: "文字颜色" });
  fireEvent.change(screen.getByRole("combobox", { name: "文字颜色" }), {
    target: { value: "#1d4ed8" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "对齐" }), {
    target: { value: "center" },
  });
  expect(body.editor.getHTML()).toContain("color: rgb(29, 78, 216)");
  expect(body.editor.getHTML()).toContain("text-align: center");
  act(() => body.editor.commands.selectAll());
  fireEvent.click(screen.getByRole("button", { name: "清除格式" }));
  expect(body.editor.getHTML()).toBe("<p>正文</p>");
});

it("rejects adding images beyond the selected platform limit while allowing removal and text editing", async () => {
  render(
    <ControlledEditor
      initialHtml='<p>正文</p><img src="file:///tmp/a.png" data-local-path="/tmp/a.png">'
      maxImages={1}
    />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  await act(async () => {
    body.editor.commands.insertContentAt(
      1,
      '<img src="file:///tmp/b.png" data-local-path="/tmp/b.png">',
    );
  });
  expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([
    "/tmp/a.png",
  ]);
  expect(screen.getByRole("status").textContent).toContain("正文最多 1 张图片");
  act(() => body.editor.commands.setTextSelection(1));
  act(() => body.editor.commands.insertContent("继续写"));
  expect(body.editor.getText()).toContain("继续写");
  act(() => body.editor.commands.setContent("<p>正文</p>"));
  expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([]);
});

it("isolates focused writing and preserves the editor instance, selection and undo history on exit", async () => {
  const view = render(<ControlledEditor />);
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  const editor = body.editor;
  act(() => editor.commands.setTextSelection(2));
  act(() => editor.commands.insertContent("新"));
  const selection = editor.state.selection.from;
  fireEvent.click(screen.getByRole("button", { name: "专注写作" }));
  const dialog = await screen.findByRole("dialog", { name: "专注写作" });
  expect(dialog.contains(body)).toBe(true);
  expect(view.container.contains(dialog)).toBe(false);
  expect(body.editor).toBe(editor);
  expect(editor.state.selection.from).toBe(selection);
  fireEvent.click(screen.getByRole("button", { name: "阅读预览" }));
  const previewDialog = await screen.findByRole("dialog", { name: "阅读预览" });
  fireEvent.click(previewDialog.querySelector('[data-slot="dialog-close"]')!);
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "阅读预览" })).toBeNull(),
  );
  expect(screen.getByRole("dialog", { name: "专注写作" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "退出专注写作" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "专注写作" })).toBeNull(),
  );
  expect(view.container.contains(body)).toBe(true);
  expect(body.editor).toBe(editor);
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(editor.getHTML()).toBe("<p>正文</p>");
  fireEvent.click(screen.getByRole("button", { name: "专注写作" }));
  await screen.findByRole("dialog", { name: "专注写作" });
  fireEvent.keyDown(body, { key: "Escape", code: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "专注写作" })).toBeNull(),
  );
  expect(view.container.contains(body)).toBe(true);
});

function chooseDocument() {
  fireEvent.change(screen.getByLabelText("选择导入文档"), {
    target: {
      files: [new File(["导入正文"], "文章.txt", { type: "text/plain" })],
    },
  });
}

it("已有正文时等待用户选择，取消不读取文档也不改变正文", () => {
  render(<ControlledEditor />);
  chooseDocument();
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(documentImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(documentImport).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "正文" }).textContent).toBe(
    "正文",
  );
});

it.each(["覆盖", "追加"])("选择%s后按指定方式导入，并可撤销", async (mode) => {
  render(<ControlledEditor />);
  chooseDocument();
  fireEvent.click(screen.getByRole("button", { name: mode, exact: true }));
  const body = screen.getByRole("textbox", { name: "正文" });
  await waitFor(() =>
    expect(body.textContent).toBe(
      mode === "覆盖" ? "导入正文" : "正文导入正文",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "撤销", exact: true }));
  await waitFor(() => expect(body.textContent).toBe("正文"));
});

it("空正文直接导入，不弹出选择", async () => {
  render(<ControlledEditor initialHtml="<p></p>" />);
  chooseDocument();
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "正文" }).textContent).toBe(
      "导入正文",
    ),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("仅有图片也视为已有内容，导入失败保留原正文", async () => {
  documentImport.mockRejectedValue(new Error("failed"));
  render(
    <ControlledEditor initialHtml='<p><img src="file:///tmp/image.png" data-local-path="/tmp/image.png"></p>' />,
  );
  chooseDocument();
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "覆盖", exact: true }));
  await waitFor(() => expect(documentImport).toHaveBeenCalledOnce());
  expect(
    screen.getByRole("textbox", { name: "正文" }).querySelector("img"),
  ).toBeTruthy();
});

it("全选后一次清除混合标题、嵌套列表、引用及所有文字样式", () => {
  render(
    <ControlledEditor initialHtml='<h2 style="text-align:center"><strong><span style="color:#b91c1c;font-size:20px">标题</span></strong></h2><p style="text-align:right"><a href="https://example.com"><u><em><s><span style="background-color:#fef08a">正文</span></s></em></u></a></p><ul><li><p style="text-align:center"><strong>一级</strong></p><ol start="3"><li><p style="text-align:right"><em>二级</em></p><blockquote><p><strong>三级引用</strong></p></blockquote></li></ol></li></ul><blockquote><h3 style="text-align:center"><u>引用</u></h3><p><strong>末段</strong></p></blockquote><p>结尾</p>' />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => body.editor.commands.selectAll());
  fireEvent.click(screen.getByRole("button", { name: "清除格式" }));
  expect(body.editor.getHTML()).toBe(
    "<p>标题</p><p>正文</p><p>一级</p><p>二级</p><p>三级引用</p><p>引用</p><p>末段</p><p>结尾</p>",
  );
});

it("清除全文格式保留图片、图注和原有空段落，一次撤销恢复原格式", () => {
  render(
    <ControlledEditor initialHtml='<h2 style="text-align:center"><strong>标题</strong></h2><p></p><figure data-article-image><img src="file:///tmp/a.png" data-local-path="/tmp/a.png" width="320" height="240" alt="图片"><figcaption>图注</figcaption></figure><p><a href="https://example.com"><u>链接</u></a></p>' />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  const original = body.editor.getHTML();
  act(() => body.editor.commands.selectAll());
  fireEvent.click(screen.getByRole("button", { name: "清除格式" }));
  const result = body.editor.getHTML();
  expect(result).toContain("<p>标题</p><p></p>");
  expect(result).toContain("<figcaption>图注</figcaption>");
  expect(result).toContain('width="320"');
  expect(result).toContain("<p>链接</p>");
  expect(extractLocalImagePathsFromHtml(result)).toEqual(["/tmp/a.png"]);
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(body.editor.getHTML()).toBe(original);
});

it("清除选区格式不会清除其他段落的样式", () => {
  render(
    <ControlledEditor initialHtml="<p><strong>保留</strong></p><p><strong>清除</strong></p><p><em>保留</em></p>" />,
  );
  const body = screen.getByRole("textbox", {
    name: "正文",
  }) as HTMLDivElement & { editor: Editor };
  act(() => body.editor.commands.setTextSelection({ from: 5, to: 7 }));
  fireEvent.click(screen.getByRole("button", { name: "清除格式" }));
  expect(body.editor.getHTML()).toBe(
    "<p><strong>保留</strong></p><p>清除</p><p><em>保留</em></p>",
  );
});

it.each([1, 5])(
  "光标位于 %s 且没有选区时清除全文格式，保持无选区并可撤销",
  (position) => {
    render(
      <ControlledEditor initialHtml='<h2><strong>标题</strong></h2><blockquote><p style="text-align:center"><u>正文</u></p></blockquote><p><em>结尾</em></p>' />,
    );
    const body = screen.getByRole("textbox", {
      name: "正文",
    }) as HTMLDivElement & { editor: Editor };
    const original = body.editor.getHTML();
    act(() => body.editor.commands.setTextSelection(position));
    expect(body.editor.state.selection.empty).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "清除格式" }));
    expect(body.editor.getHTML()).toBe("<p>标题</p><p>正文</p><p>结尾</p>");
    expect(body.editor.state.selection.empty).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(body.editor.getHTML()).toBe(original);
  },
);
