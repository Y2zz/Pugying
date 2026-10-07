// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import type { ArticleCoverEditDialog } from "./publish-article/ArticleCoverEditDialog";
import { MemoryRouter } from "react-router-dom";
import {
  createContent,
  fetchPlatformAccounts,
  type PlatformAccountItem,
} from "@/lib/api";
import { toast } from "@/components/AppToaster";
import { submitDistribution } from "@/lib/distribution";
import PublishGraphic from "./PublishGraphic";

vi.mock("@/components/AppToaster", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/lib/distribution", () => ({ submitDistribution: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchPlatformCatalog: vi.fn().mockResolvedValue([]),
  fetchPlatformAccounts: vi.fn().mockResolvedValue([]),
  createContent: vi
    .fn()
    .mockResolvedValue({ id: "draft", status: "draft", targets: [] }),
  uploadContentCover: vi
    .fn()
    .mockResolvedValue({ id: "draft", status: "draft", targets: [] }),
}));
vi.mock("./publish-article/scroll-to-article-field", () => ({
  scrollToArticleField: vi.fn(),
}));
vi.mock("./publish-article/ArticleCoverEditDialog", () => ({
  ArticleCoverEditDialog: ({
    onSaved,
    onClose,
  }: ComponentProps<typeof ArticleCoverEditDialog>) => (
    <button
      onClick={() => {
        onSaved({
          croppedFile: new File(["cover"], "cover.png", { type: "image/png" }),
          sourceUrl: "data:image/png;base64,Y292ZXI=",
        });
        onClose();
      }}
    >
      确认测试封面
    </button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([]);
  vi.mocked(submitDistribution).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  URL.createObjectURL = vi.fn().mockReturnValue("blob:cover");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("pugyingDesktop", {
    available: true,
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    getPathForFile: () => "/tmp/image.png",
    readLocalImageDataUrl: vi
      .fn()
      .mockResolvedValue("data:image/png;base64,aW1hZ2U="),
    checkLocalPathReadable: vi.fn().mockResolvedValue(true),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openPage() {
  render(
    <MemoryRouter>
      <PublishGraphic />
    </MemoryRouter>,
  );
  return screen.findByRole("textbox", { name: "标题", exact: true });
}

it("保存空标题时用 Toast 提示、标红并聚焦字段，修改后恢复", async () => {
  const title = await openPage();
  expect(title.getAttribute("aria-invalid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() => expect(document.activeElement).toBe(title));
  expect(toast.add).toHaveBeenCalledWith({
    type: "error",
    title: "标题未填写",
  });
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("请填写标题")).toBeTruthy();
  expect(document.querySelector('[data-slot="alert"]')).toBeNull();
  expect(createContent).not.toHaveBeenCalled();
  fireEvent.change(title, { target: { value: "新标题" } });
  expect(title.getAttribute("aria-invalid")).toBeNull();
  expect(screen.queryByText("请填写标题")).toBeNull();
});

it("未选账号时字段上限与保存一致，标题失焦整理空白", async () => {
  const title = await openPage();
  fireEvent.change(title, { target: { value: "字".repeat(31) } });
  expect(screen.getByText("31/30")).toBeTruthy();
  expect(screen.getByText("最多 30 字")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() => expect(document.activeElement).toBe(title));
  expect(toast.add).toHaveBeenCalledWith({
    type: "error",
    title: "标题超出 1 字",
  });
  expect(createContent).not.toHaveBeenCalled();
  fireEvent.change(title, { target: { value: "  新   标题  " } });
  fireEvent.blur(title);
  expect((title as HTMLInputElement).value).toBe("新 标题");
  expect(screen.getByText("4/30")).toBeTruthy();
});

it("文案中的连续空白按实际保存内容计数，字段与检查项同时报超限", async () => {
  const title = await openPage();
  fireEvent.change(title, { target: { value: "标题" } });
  const body = screen.getByRole("textbox", { name: "文案" });
  fireEvent.change(body, { target: { value: `甲${" ".repeat(999)}乙` } });
  expect(screen.getByText("1001/1000")).toBeTruthy();
  expect(screen.getByText("最多 1000 字")).toBeTruthy();
  expect(screen.getByRole("button", { name: /正文.*超出 1 字/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() => expect(document.activeElement).toBe(body));
  expect(createContent).not.toHaveBeenCalled();
});

it("点击文案检查项时标红并聚焦，填写后提示消失", async () => {
  await openPage();
  fireEvent.click(screen.getByRole("button", { name: /正文.*未填写/ }));
  const body = screen.getByRole("textbox", { name: "文案" });
  expect(document.activeElement).toBe(body);
  expect(body.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("请填写文案")).toBeTruthy();
  fireEvent.change(body, { target: { value: "文案" } });
  expect(body.getAttribute("aria-invalid")).toBeNull();
  expect(screen.queryByText("请填写文案")).toBeNull();
});

it("点击配图检查项时聚焦添加槽位，添加后清除错误", async () => {
  await openPage();
  fireEvent.click(
    screen.getByRole("button", { name: /配图.*请至少选择一张图片/ }),
  );
  const input = screen.getByLabelText("添加图片");
  expect(document.activeElement).toBe(input);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(input.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("请至少选择一张图片");
  fireEvent.change(input, {
    target: {
      files: [new File(["image"], "image.png", { type: "image/png" })],
    },
  });
  await waitFor(() => expect(input.getAttribute("aria-invalid")).toBeNull());
  expect(
    screen.queryByRole("button", { name: /配图.*请至少选择一张图片/ }),
  ).toBeNull();
});

it("封面缺失时点击检查项会标红并聚焦对应槽位", async () => {
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([
    {
      id: "a",
      displayName: "抖音账号",
      platform: "douyin",
      status: "active",
    } as PlatformAccountItem,
  ]);
  const title = await openPage();
  fireEvent.change(title, { target: { value: "😀".repeat(20) } });
  expect(
    within(title.closest('[data-slot="field"]') as HTMLElement).getByText(
      "20/20",
    ),
  ).toBeTruthy();
  expect(title.getAttribute("aria-invalid")).toBeNull();
  const section = screen
    .getByText("默认用于所有账号；个别账号可在分发里单独更换")
    .closest("section")!;
  const slot = within(section).getByRole("button", { name: /设置竖版.*封面/ });
  expect(slot.getAttribute("aria-invalid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /封面.*缺少竖版封面/ }));
  expect(slot.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(slot);
  expect(screen.getByText(/请设置竖版.*封面/)).toBeTruthy();
  fireEvent.click(slot);
  fireEvent.click(screen.getByRole("button", { name: "确认测试封面" }));
  expect(
    within(section)
      .getByRole("button", { name: /编辑竖版.*封面/ })
      .getAttribute("aria-invalid"),
  ).toBeNull();
  expect(screen.queryByText(/请设置竖版.*封面/)).toBeNull();
  expect(
    screen.queryByRole("button", { name: /封面.*缺少竖版封面/ }),
  ).toBeNull();
});

it("未选账号时封面不报缺失，账号检查项聚焦绑定入口", async () => {
  await openPage();
  expect(screen.queryByRole("button", { name: /封面.*未设置/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /分发账号.*尚未选择/ }));
  expect(document.activeElement?.textContent).toContain("绑定账号");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("只填写标题仍可保存草稿，缺文案和图片不提前显示字段错误", async () => {
  const title = await openPage();
  fireEvent.change(title, { target: { value: "草稿标题" } });
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() => expect(createContent).toHaveBeenCalledOnce());
  expect(screen.queryByText("请填写文案")).toBeNull();
  expect(
    screen.getByLabelText("添加图片").getAttribute("aria-invalid"),
  ).toBeNull();
  expect(toast.add).toHaveBeenCalledWith({ type: "success", title: "已保存" });
});

it("已有绑定账号时点击账号检查项聚焦添加入口，不自动弹窗", async () => {
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([
    {
      id: "a",
      displayName: "失效账号",
      platform: "douyin",
      status: "expired",
    } as PlatformAccountItem,
  ]);
  await openPage();
  fireEvent.click(screen.getByRole("button", { name: /分发账号.*尚未选择/ }));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "添加账号", exact: true }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("直接发布依次定位未完成项，通过后提交并锁定操作，成功反馈与文章一致", async () => {
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([
    {
      id: "a",
      displayName: "抖音账号",
      platform: "douyin",
      status: "active",
    } as PlatformAccountItem,
  ]);
  const title = await openPage();
  fireEvent.change(title, { target: { value: "图文标题" } });
  const publish = screen.getByRole("button", { name: "发布图文" });
  fireEvent.click(publish);
  const body = screen.getByRole("textbox", { name: "文案" });
  await waitFor(() => expect(document.activeElement).toBe(body));
  expect(screen.getByText("请填写文案")).toBeTruthy();
  fireEvent.change(body, { target: { value: "图文文案" } });
  fireEvent.click(publish);
  const images = screen.getByLabelText("添加图片");
  await waitFor(() => expect(document.activeElement).toBe(images));
  expect(images.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(images, {
    target: {
      files: [new File(["image"], "image.png", { type: "image/png" })],
    },
  });
  fireEvent.click(publish);
  const section = screen
    .getByText("默认用于所有账号；个别账号可在分发里单独更换")
    .closest("section")!;
  const slot = within(section).getByRole("button", { name: /设置竖版.*封面/ });
  await waitFor(() => expect(document.activeElement).toBe(slot));
  expect(slot.getAttribute("aria-invalid")).toBe("true");
  expect(createContent).not.toHaveBeenCalled();
  expect(submitDistribution).not.toHaveBeenCalled();
  fireEvent.click(slot);
  fireEvent.click(screen.getByRole("button", { name: "确认测试封面" }));
  let finish!: () => void;
  vi.mocked(submitDistribution).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(publish);
  const pending = await screen.findByRole("button", { name: "提交中…" });
  expect((pending as HTMLButtonElement).disabled).toBe(true);
  expect(
    (screen.getByRole("button", { name: "保存草稿" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await waitFor(() =>
    expect(submitDistribution).toHaveBeenCalledExactlyOnceWith("draft"),
  );
  finish();
  await waitFor(() =>
    expect(toast.add).toHaveBeenCalledWith({
      type: "success",
      title: "已开始分发",
    }),
  );
  expect(
    (screen.getByRole("button", { name: "发布图文" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
