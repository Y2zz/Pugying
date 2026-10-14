/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DistributionTaskRow } from "@shared/distribution";
import Dashboard from "./Dashboard";

const mocks = vi.hoisted(() => ({
  state: {} as any,
  contents: vi.fn(),
  accounts: vi.fn(),
  distribution: vi.fn(),
}));

vi.mock("@/components/publishing/DistributionProvider", () => ({
  useDistributionState: () => mocks.state,
}));

vi.mock("@/lib/api", () => ({
  fetchContents: mocks.contents,
  fetchPlatformAccounts: mocks.accounts,
  fetchDistributionPage: mocks.distribution,
}));

const task = (
  id: string,
  overrides: Partial<DistributionTaskRow> = {},
): DistributionTaskRow => ({
  targetId: id,
  contentId: "work",
  title: "春风里的蒲公英",
  type: "video",
  accountId: id,
  accountName: "蒲公英日记",
  accountAvailable: true,
  platform: "douyin",
  publishStatus: "succeeded",
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  errorCode: null,
  errorMessage: null,
  platformUrl: null,
  taskCount: 1,
  processedCount: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    snapshot: null,
    activePage: {
      items: [],
      total: 0,
      workTotal: 0,
      page: 1,
      pageSize: 20,
      counts: { active: 2, waiting: 1, attention: 3, completed: 4 },
      typeCounts: { all: 0, article: 0, graphic: 0, video: 0 },
    },
    loading: false,
    hasRead: true,
    error: "",
    version: 1,
    refresh: vi.fn(),
  };
  mocks.contents.mockResolvedValue({
    counts: {
      all: 12,
      draft: 0,
      pending: 0,
      publishing: 0,
      needs_attention: 0,
      completed: 0,
    },
    items: [],
    total: 12,
    page: 1,
    pageSize: 1,
  });
  mocks.accounts.mockResolvedValue([
    { id: "a1", platform: "douyin", displayName: "甲" },
    { id: "a2", platform: "xiaohongshu", displayName: "乙" },
  ]);
  mocks.distribution.mockResolvedValue({
    items: [task("t1"), task("t2", { title: "桂花雨", platform: "xiaohongshu" })],
    total: 2,
    workTotal: 2,
    page: 1,
    pageSize: 5,
    counts: { active: 2, waiting: 1, attention: 3, completed: 4 },
    typeCounts: { all: 2, article: 0, graphic: 0, video: 2 },
  });
});

afterEach(cleanup);

function setup() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

it("shows live stats, shortcuts, and recent distribution tasks", async () => {
  setup();
  expect(screen.getByText("概览")).toBeTruthy();
  await waitFor(() => {
    expect(
      within(screen.getByText("在作品管理中查看和编辑").closest("a")!).getByText(
        "12",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByText("在媒体账号中管理绑定").closest("a")!).getByText(
        "2",
      ),
    ).toBeTruthy();
  });
  // 进行中 = active + waiting = 3；待处理 = attention = 3
  expect(
    within(screen.getByText("正在发布或排队等待").closest("a")!).getByText("3"),
  ).toBeTruthy();
  expect(
    within(screen.getByText("需要确认或重试的任务").closest("a")!).getByText(
      "3",
    ),
  ).toBeTruthy();

  expect(screen.getByRole("button", { name: /去发布/ })).toBeTruthy();
  // Button+Link 在 Base UI 下仍为 role=button，用 href 确认跳转
  expect(
    (screen.getByRole("button", { name: /^作品$/ }) as HTMLAnchorElement).href,
  ).toMatch(/\/contents$/);
  expect(
    (screen.getByRole("button", { name: /^账号$/ }) as HTMLAnchorElement).href,
  ).toMatch(/\/platform-accounts$/);
  expect(
    (screen.getByRole("button", { name: /^队列$/ }) as HTMLAnchorElement).href,
  ).toMatch(/\/distribution$/);

  expect(await screen.findByText("春风里的蒲公英")).toBeTruthy();
  expect(screen.getByText("桂花雨")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "查看全部" }) as HTMLAnchorElement)
      .href,
  ).toMatch(/\/distribution$/);
});

it("shows an empty recent list when there are no distribution tasks", async () => {
  mocks.distribution.mockResolvedValue({
    items: [],
    total: 0,
    workTotal: 0,
    page: 1,
    pageSize: 5,
    counts: { active: 0, waiting: 0, attention: 0, completed: 0 },
    typeCounts: { all: 0, article: 0, graphic: 0, video: 0 },
  });
  setup();
  expect(await screen.findByText("还没有分发任务")).toBeTruthy();
});

it("keeps stats as dashes and shows a restrained hint when loading fails", async () => {
  mocks.contents.mockRejectedValue(new Error("offline"));
  mocks.accounts.mockRejectedValue(new Error("offline"));
  mocks.distribution.mockRejectedValue(new Error("offline"));
  setup();
  expect(
    await screen.findByText("暂时无法读取作品与账号，请稍后重试"),
  ).toBeTruthy();
  expect(
    await screen.findByText("暂时无法读取分发任务，请稍后重试"),
  ).toBeTruthy();
  const contentCard = screen
    .getByText("在作品管理中查看和编辑")
    .closest("a");
  expect(contentCard).toBeTruthy();
  expect(within(contentCard!).getByText("—")).toBeTruthy();
});
