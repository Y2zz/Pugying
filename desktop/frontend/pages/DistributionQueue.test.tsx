// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type {
  DistributionPage,
  DistributionTaskRow,
} from "@shared/distribution";
import DistributionQueue from "./DistributionQueue";
const mocks = vi.hoisted(() => ({
  state: {} as any,
  fetch: vi.fn(),
  confirm: vi.fn(),
  submit: vi.fn(),
  cancel: vi.fn(),
  retryMany: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/components/publishing/DistributionProvider", () => ({
  useDistributionState: () => mocks.state,
}));
vi.mock("@/lib/api", () => ({
  fetchDistributionPage: mocks.fetch,
  confirmDistributionPublished: mocks.confirm,
}));
vi.mock("@/lib/distribution", () => ({
  submitDistribution: mocks.submit,
  cancelDistribution: mocks.cancel,
  retryDistributions: mocks.retryMany,
}));
vi.mock("@/lib/app-toast", () => ({ toast: { add: mocks.toast } }));
const row = (
  id: string,
  overrides: Partial<DistributionTaskRow> = {},
): DistributionTaskRow => ({
  targetId: id,
  contentId: "work",
  title: "春风里的蒲公英",
  type: "video",
  accountId: id,
  accountName: `账号${id}`,
  accountAvailable: true,
  platform: "douyin",
  publishStatus: "failed",
  startedAt: new Date(Date.now() - 12000).toISOString(),
  finishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  errorCode: "PUBLISH_FAILED",
  errorMessage: null,
  platformUrl: null,
  taskCount: 3,
  processedCount: 1,
  ...overrides,
});
const page = (
  items: DistributionTaskRow[],
  extra: Partial<DistributionPage> = {},
): DistributionPage => ({
  items,
  total: items.length,
  workTotal: new Set(items.map((item) => item.contentId)).size,
  page: 1,
  pageSize: 10,
  counts: { active: 1, waiting: 1, attention: 2, completed: 3 },
  typeCounts: { all: 4, video: 2, graphic: 1, article: 1 },
  ...extra,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    activePage: page([]),
    snapshot: { revision: 1, concurrency: 3, tasks: [] },
    version: 1,
    loading: false,
    hasRead: true,
    error: "",
    refresh: mocks.refresh,
  };
  mocks.fetch.mockResolvedValue(page([]));
  mocks.submit.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.confirm.mockResolvedValue(undefined);
  mocks.retryMany.mockResolvedValue({ queued: ["a", "b"], failed: [] });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
function setup() {
  return render(
    <MemoryRouter>
      <DistributionQueue />
    </MemoryRouter>,
  );
}
const lastCall = () => mocks.fetch.mock.calls.at(-1)!;

it("reads one urgency-ordered list with type as the primary filter", async () => {
  setup();
  await waitFor(() =>
    expect(lastCall()).toEqual([
      "all",
      1,
      { type: undefined, platforms: undefined, q: undefined, includeCompleted: true },
      20,
    ]),
  );
  const types = screen.getByRole("tablist", { name: "作品类型" });
  await within(types).findByRole("tab", { name: /视频\s*2/ });
  fireEvent.click(within(types).getByRole("tab", { name: /图文/ }));
  await waitFor(() => expect(lastCall()[2].type).toBe("graphic"));
  expect(screen.queryByRole("button", { name: /需要处理/ })).toBeNull();
});

it("persists the hide-completed switch and shows a hidden-completed empty state", async () => {
  setup();
  fireEvent.click(await screen.findByRole("switch"));
  await waitFor(() => expect(lastCall()[2].includeCompleted).toBe(false));
  expect(window.localStorage.getItem("pugying.distribution.hideCompleted")).toBe("1");
  expect(await screen.findByText("作品都发完了")).toBeTruthy();
  expect(screen.getByText("已隐藏已完成的作品。")).toBeTruthy();
  expect(screen.queryByText("没有找到符合条件的作品")).toBeNull();
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "显示已完成" }));
  await waitFor(() => expect(lastCall()[2].includeCompleted).toBe(true));
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  expect(window.localStorage.getItem("pugying.distribution.hideCompleted")).toBe("0");
  cleanup();
  window.localStorage.setItem("pugying.distribution.hideCompleted", "1");
  setup();
  await waitFor(() => expect(lastCall()[2].includeCompleted).toBe(false));
});

it("searches by keyword and offers to clear filters when nothing matches", async () => {
  setup();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索作品标题或账号" }), {
    target: { value: "桂花" },
  });
  await waitFor(() => expect(lastCall()[2].q).toBe("桂花"), { timeout: 2000 });
  expect(await screen.findByText("没有找到符合条件的作品")).toBeTruthy();
  expect(screen.getByText("当前筛选：“桂花”")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "清除全部" }).at(-1)!);
  await waitFor(() => expect(lastCall()[2].q).toBeUndefined());
});

it("shows account states inline with one action each", async () => {
  mocks.state.snapshot.tasks = [
    { targetId: "run", contentId: "work", accountId: "run", state: "running", phase: "uploading", uploadPercent: 62, queuedAt: "" },
    { targetId: "wait", contentId: "work", accountId: "wait", state: "waiting", waitingReason: "capacity", queuedAt: new Date().toISOString() },
  ];
  mocks.fetch.mockResolvedValue(
    page([
      row("auth", { errorCode: "AUTH_EXPIRED" }),
      row("run", { publishStatus: "running", errorCode: null }),
      row("wait", { publishStatus: "queued", errorCode: null }),
      row("ok", { publishStatus: "succeeded", errorCode: null, platformUrl: "https://www.douyin.com/video/1" }),
      row("media", { errorCode: "MEDIA_MISSING" }),
    ]),
  );
  setup();
  const card = await screen.findByRole("region", { name: "春风里的蒲公英" });
  expect(within(card).getByText("授权过期")).toBeTruthy();
  expect(within(card).getByRole("link", { name: "重新授权" })).toBeTruthy();
  expect(within(card).getByRole("progressbar", { name: "上传进度" }).getAttribute("aria-valuenow")).toBe("62");
  expect(within(card).getByText("排队中")).toBeTruthy();
  expect(within(card).getByText("已发布")).toBeTruthy();
  expect(within(card).getByRole("link", { name: /去平台查看/ })).toBeTruthy();
  expect(within(card).getByRole("link", { name: "重新选择" }).getAttribute("href")).toBe("/publish/video?id=work");
  fireEvent.click(within(card).getByRole("button", { name: "取消" }));
  await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith({ contentId: "work", targetId: "wait" }));
});

it("retries a failed account while others of the work are still publishing", async () => {
  mocks.state.snapshot.tasks = [
    { targetId: "busy", contentId: "work", accountId: "busy", state: "running", queuedAt: "" },
  ];
  mocks.fetch.mockResolvedValue(page([row("1"), row("busy", { publishStatus: "running", errorCode: null })]));
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "重试" }));
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith("work", "1"));
  expect(mocks.refresh).toHaveBeenCalled();
});

it("offers retry-all only when a work has two or more retryable failures", async () => {
  mocks.fetch.mockResolvedValue(
    page([row("a"), row("b", { publishStatus: "cancelled", errorCode: "cancelled" }), row("c", { errorCode: "AUTH_EXPIRED" }), row("d", { contentId: "solo", title: "单个失败" })]),
  );
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "全部重试（2）" }));
  await waitFor(() =>
    expect(mocks.retryMany).toHaveBeenCalledWith([
      { contentId: "work", targetId: "a" },
      { contentId: "work", targetId: "b" },
    ]),
  );
  const solo = screen.getByRole("region", { name: "单个失败" });
  expect(within(solo).queryByRole("button", { name: /全部重试/ })).toBeNull();
});

it("expands an inline explanation for an unknown result and resolves it", async () => {
  mocks.fetch.mockResolvedValue(page([row("u", { errorCode: "PUBLISH_RESULT_UNKNOWN" })]));
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "核对" }));
  expect(screen.getByText(/作品可能已经发出去了/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "已经发出去了" }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith("work", "u"));
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "没找到，重新发布" }));
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith("work", "u"));
});

it("collapses completed works into one expandable row", async () => {
  mocks.fetch.mockResolvedValue(
    page([
      row("s1", { contentId: "done", title: "已完成的作品", publishStatus: "succeeded", errorCode: null, platformUrl: "https://www.douyin.com/video/1" }),
      row("s2", { contentId: "done", title: "已完成的作品", publishStatus: "succeeded", errorCode: null, platform: "bilibili" }),
    ]),
  );
  setup();
  const card = await screen.findByRole("region", { name: "已完成的作品" });
  expect(within(card).getByLabelText("2 个账号已发布")).toBeTruthy();
  expect(within(card).queryByRole("link", { name: /去平台查看/ })).toBeNull();
  fireEvent.click(within(card).getByRole("button", { expanded: false }));
  expect(within(card).getByRole("link", { name: /去平台查看/ })).toBeTruthy();
});

it("paginates by work", async () => {
  mocks.fetch.mockResolvedValue(page([row("1")], { workTotal: 45 }));
  setup();
  expect(await screen.findByText("第 1 / 3 页")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await waitFor(() => expect(lastCall()[1]).toBe(2));
});

it("shows an unknown state instead of an empty queue when reading fails", async () => {
  mocks.fetch.mockRejectedValue(new Error("offline"));
  setup();
  expect(await screen.findByText("暂时无法读取任务状态")).toBeTruthy();
});

// cmdk 依赖的浏览器接口在 jsdom 中缺失
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => undefined;

it("multi-selects platforms with the same rules as accounts and clears with the inline ✕", async () => {
  setup();
  const trigger = await screen.findByRole("button", { name: /^平台/ });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: "抖音" }));
  await waitFor(() => expect(lastCall()[2].platforms).toEqual(["douyin"]));
  expect(screen.getByText("平台 · 抖音")).toBeTruthy();
  fireEvent.click(screen.getByRole("option", { name: "小红书" }));
  await waitFor(() => expect(lastCall()[2].platforms).toEqual(["douyin", "xiaohongshu"]));
  expect(screen.getByText("平台 · 2").closest("button")).toBe(trigger);
  // 固定宽度，选中前后不变
  expect(trigger.parentElement?.className).toContain("w-36");
  // 选中后整个按钮填充底色
  expect(trigger.parentElement?.hasAttribute("data-selected")).toBe(true);
  expect(trigger.parentElement?.className).toContain("bg-primary");
  expect(trigger.parentElement?.className).not.toMatch(/(^| )border( |$)/);
  fireEvent.click(screen.getByRole("button", { name: "清除平台筛选" }));
  await waitFor(() => expect(lastCall()[2].platforms).toBeUndefined());
  expect(screen.getByText("平台")).toBeTruthy();
});

it("shows 清除全部 when any toolbar filter is active and resets everything including hide-completed", async () => {
  setup();
  await screen.findByRole("button", { name: /^平台/ });
  // 始终占位，无筛选时禁用
  expect((screen.getAllByRole("button", { name: "清除全部" })[0] as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(lastCall()[2].includeCompleted).toBe(false));
  fireEvent.change(screen.getByRole("textbox", { name: "搜索作品标题或账号" }), {
    target: { value: "桂花" },
  });
  await waitFor(() => expect(lastCall()[2].q).toBe("桂花"), { timeout: 2000 });
  expect(await screen.findByText("没有找到符合条件的作品")).toBeTruthy();
  // 隐藏已完成也算筛选，空状态要说明并提供清除
  expect(await screen.findByText("当前筛选：“桂花” · 隐藏已完成")).toBeTruthy();
  const toolbarClear = screen.getAllByRole("button", { name: "清除全部" });
  expect(toolbarClear.length).toBeGreaterThan(0);
  fireEvent.click(toolbarClear[0]);
  await waitFor(() =>
    expect(lastCall()[2]).toMatchObject({ q: undefined, includeCompleted: true, platforms: undefined }),
  );
  // 始终占位，无筛选时禁用
  expect((screen.getAllByRole("button", { name: "清除全部" })[0] as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("textbox", { name: "搜索作品标题或账号" }) as HTMLInputElement).value).toBe("");
});

it("names the selected type in the empty-state title", async () => {
  setup();
  const types = screen.getByRole("tablist", { name: "作品类型" });
  fireEvent.click(await within(types).findByRole("tab", { name: /文章/ }));
  await waitFor(() => expect(lastCall()[2].type).toBe("article"));
  expect(await screen.findByText("“文章”下暂无发布记录")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch"));
  expect(await screen.findByText("没有找到符合条件的作品")).toBeTruthy();
  expect(screen.getByText("当前筛选：文章 · 隐藏已完成")).toBeTruthy();
  // 只开了隐藏已完成：仍是「显示已完成」
  fireEvent.click(screen.getByRole("button", { name: "显示已完成" }));
  await waitFor(() => expect(lastCall()[2].includeCompleted).toBe(true));
  expect(lastCall()[2].type).toBe("article");
  // 没有其他筛选：提供「查看全部类型」
  fireEvent.click(await screen.findByRole("button", { name: "查看全部类型" }));
  await waitFor(() => expect(lastCall()[2].type).toBeUndefined());
});

it("clear-all in toolbar and empty state never resets the type tab", async () => {
  setup();
  const types = screen.getByRole("tablist", { name: "作品类型" });
  fireEvent.click(await within(types).findByRole("tab", { name: /图文/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "搜索作品标题或账号" }), {
    target: { value: "桂花" },
  });
  await waitFor(() => expect(lastCall()[2].q).toBe("桂花"), { timeout: 2000 });
  expect(await screen.findByText("当前筛选：图文 · “桂花”")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "查看全部类型" })).toBeNull();
  const [, emptyClear] = screen.getAllByRole("button", { name: "清除全部" });
  fireEvent.click(emptyClear);
  await waitFor(() => expect(lastCall()[2].q).toBeUndefined());
  expect(lastCall()[2].type).toBe("graphic");
  expect(within(types).getByRole("tab", { name: /图文/ }).getAttribute("aria-selected")).toBe("true");
});

it("moves focus to the search input after toolbar clear-all", async () => {
  setup();
  fireEvent.click(await screen.findByRole("switch"));
  await waitFor(() => expect(lastCall()[2].includeCompleted).toBe(false));
  const clear = screen.getAllByRole("button", { name: "清除全部" })[0] as HTMLButtonElement;
  expect(clear.disabled).toBe(false);
  fireEvent.click(clear);
  await waitFor(() => expect(clear.disabled).toBe(true));
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "搜索作品标题或账号" }));
});

it("hides the trigger focus ring after pointer interaction and restores it for keyboard", async () => {
  setup();
  const trigger = await screen.findByRole("button", { name: /^平台/ });
  const box = trigger.parentElement!;
  expect(box.className).toContain("focus-visible]:ring-3");
  fireEvent.pointerDown(trigger);
  await waitFor(() => expect(box.className).not.toContain("focus-visible]:ring-3"));
  fireEvent.keyDown(document.body, { key: "Tab" });
  await waitFor(() => expect(box.className).toContain("focus-visible]:ring-3"));
});
