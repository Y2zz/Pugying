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
  submit: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/components/publishing/DistributionProvider", () => ({
  useDistributionState: () => mocks.state,
}));
vi.mock("@/lib/api", () => ({ fetchDistributionPage: mocks.fetch }));
vi.mock("@/lib/distribution", () => ({ submitDistribution: mocks.submit }));
vi.mock("@/lib/app-toast", () => ({ toast: { add: mocks.toast } }));
const row = (
  id: string,
  overrides: Partial<DistributionTaskRow> = {},
): DistributionTaskRow => ({
  targetId: id,
  contentId: "work",
  title: "春风里的蒲公英",
  type: "article",
  accountId: id,
  accountName: `账号${id}`,
  accountAvailable: true,
  platform: "douyin",
  publishStatus: "running",
  startedAt: new Date(Date.now() - 12000).toISOString(),
  finishedAt: null,
  updatedAt: new Date().toISOString(),
  errorCode: null,
  errorMessage: null,
  platformUrl: null,
  taskCount: 3,
  processedCount: 1,
  ...overrides,
});
const page = (items: DistributionTaskRow[]): DistributionPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  counts: { active: 2, waiting: 2, attention: 2, completed: 1 },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    activePage: page([row("1"), row("2", { platform: "bilibili" })]),
    snapshot: {
      revision: 1,
      concurrency: 3,
      tasks: [
        {
          targetId: "1",
          contentId: "work",
          accountId: "1",
          state: "running",
          phase: "uploading",
          queuedAt: "",
        },
        {
          targetId: "2",
          contentId: "work",
          accountId: "2",
          state: "saving",
          queuedAt: "",
        },
      ],
    },
    version: 1,
    loading: false,
    hasRead: true,
    error: "",
    refresh: mocks.refresh,
  };
  mocks.fetch.mockResolvedValue(page([]));
  mocks.submit.mockResolvedValue(undefined);
});
afterEach(cleanup);
function setup() {
  return render(
    <MemoryRouter>
      <DistributionQueue />
    </MemoryRouter>,
  );
}
it("shows an unknown state instead of an empty queue when the first read fails", () => {
  mocks.state = {
    ...mocks.state,
    activePage: page([]),
    hasRead: false,
    error: "分发状态更新失败，请重试",
  };
  setup();
  expect(
    screen.getByRole("tab", { name: "正在发布，状态待更新" }),
  ).toBeTruthy();
  expect(screen.getByText("暂时无法读取任务状态")).toBeTruthy();
  expect(screen.queryByText("当前没有正在发布的任务")).toBeNull();
});
it("offers a direct path from an idle queue to waiting tasks", async () => {
  mocks.state.activePage = page([]);
  mocks.fetch.mockResolvedValue(
    page([row("problem", { publishStatus: "failed" })]),
  );
  setup();
  fireEvent.click(screen.getByRole("button", { name: "查看等待任务" }));
  await screen.findByText("账号problem");
  expect(mocks.fetch).toHaveBeenCalledWith("waiting", 1);
});
it("presents a live retry instead of a stale failure and does not offer duplicate publishing", () => {
  mocks.state.activePage = page([
    row("1", {
      publishStatus: "failed",
      finishedAt: new Date(Date.now() - 30000).toISOString(),
    }),
  ]);
  setup();
  expect(screen.getByText("上传到平台")).toBeTruthy();
  expect(screen.getByText("发布中")).toBeTruthy();
  expect(screen.queryByText("发布失败")).toBeNull();
  expect(screen.queryByRole("button", { name: "重新发布" })).toBeNull();
});
it("offers a content-specific repair for missing media and preserves retry after repair", async () => {
  mocks.state.snapshot.tasks = [];
  mocks.fetch.mockResolvedValue(
    page([
      row("media", {
        publishStatus: "failed",
        errorCode: "MEDIA_MISSING",
        type: "video",
      }),
    ]),
  );
  setup();
  fireEvent.click(screen.getByRole("tab", { name: "需要处理，2 项任务" }));
  const repair = await screen.findByRole("link", { name: "重新选择素材" });
  expect(repair.getAttribute("href")).toBe("/publish/video?id=work");
  expect(screen.getByRole("button", { name: "重新发布" })).toBeTruthy();
});
it("groups platform accounts under the work, presents actual phases and preserves a link to work details", () => {
  setup();
  expect(
    screen.getAllByRole("heading", { name: "春风里的蒲公英" }),
  ).toHaveLength(1);
  expect(screen.getByText("已处理 1 / 3 个账号")).toBeTruthy();
  expect(screen.getByText("上传到平台")).toBeTruthy();
  expect(screen.getByText("正在保存结果")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "查看作品" }).getAttribute("href"),
  ).toBe("/contents?contentId=work");
});
it("distinguishes account waits from capacity waits and uses task counts for navigation", async () => {
  mocks.fetch.mockResolvedValue(
    page([
      row("3", { publishStatus: "queued", startedAt: null }),
      row("4", { publishStatus: "queued", startedAt: null }),
    ]),
  );
  mocks.state.snapshot.tasks = [
    { targetId: "3", state: "waiting", waitingReason: "account" },
    { targetId: "4", state: "waiting", waitingReason: "capacity" },
  ];
  setup();
  fireEvent.click(screen.getByRole("tab", { name: "等待中，2 项任务" }));
  await screen.findByText("等待该账号的上一项任务");
  expect(screen.getByText("等待空闲位置")).toBeTruthy();
  expect(mocks.fetch).toHaveBeenCalledWith("waiting", 1);
});
it("retries just the chosen failed account, leaves successful targets alone and refreshes the global state", async () => {
  mocks.state.snapshot.tasks = [];
  mocks.fetch.mockResolvedValue(
    page([
      row("failed", { publishStatus: "failed", errorCode: "AUTH_EXPIRED" }),
      row("removed", { publishStatus: "failed", accountAvailable: false }),
    ]),
  );
  setup();
  fireEvent.click(screen.getByRole("tab", { name: "需要处理，2 项任务" }));
  const retry = await screen.findByRole("button", { name: "重新发布" });
  expect(
    screen.getByRole("link", { name: "重新授权" }).getAttribute("href"),
  ).toBe("/platform-accounts");
  fireEvent.click(retry);
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith("work", "failed"),
  );
  expect(mocks.refresh).toHaveBeenCalled();
});
it("requires platform verification before retrying an unknown receipt", async () => {
  mocks.state.snapshot.tasks = [];
  mocks.fetch.mockResolvedValue(
    page([
      row("unknown", {
        publishStatus: "failed",
        errorCode: "PUBLISH_RESULT_UNKNOWN",
      }),
    ]),
  );
  setup();
  fireEvent.click(screen.getByRole("tab", { name: "需要处理，2 项任务" }));
  fireEvent.click(await screen.findByRole("button", { name: "重新发布" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "确认重新发布" }));
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith("work", "unknown"),
  );
});
it("paginates across works without losing global counts and ignores stale responses after changing view", async () => {
  const delayed = Promise.withResolvers<DistributionPage>();
  mocks.fetch.mockImplementation((view: string, pageNumber: number) =>
    view === "waiting"
      ? delayed.promise
      : Promise.resolve({
          ...page([row(`page-${pageNumber}`, { publishStatus: "failed" })]),
          total: 21,
          page: pageNumber,
        }),
  );
  setup();
  fireEvent.click(screen.getByRole("tab", { name: "等待中，2 项任务" }));
  fireEvent.click(screen.getByRole("tab", { name: "需要处理，2 项任务" }));
  await screen.findByText("账号page-1");
  delayed.resolve(page([row("old-waiting")]));
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await screen.findByText("账号page-2");
  expect(screen.queryByText("账号old-waiting")).toBeNull();
  expect(screen.getByRole("tab", { name: "正在发布，2 项任务" })).toBeTruthy();
});
it("allows a slow result request to finish while global status changes", async () => {
  const delayed = Promise.withResolvers<DistributionPage>();
  mocks.fetch.mockReturnValue(delayed.promise);
  const { rerender } = setup();
  fireEvent.click(screen.getByRole("tab", { name: "等待中，2 项任务" }));
  mocks.state = { ...mocks.state, version: 2 };
  rerender(
    <MemoryRouter>
      <DistributionQueue />
    </MemoryRouter>,
  );
  mocks.state = { ...mocks.state, version: 3 };
  rerender(
    <MemoryRouter>
      <DistributionQueue />
    </MemoryRouter>,
  );
  expect(mocks.fetch).toHaveBeenCalledOnce();
  delayed.resolve(page([row("slow", { publishStatus: "queued" })]));
  await screen.findByText("账号slow");
});
