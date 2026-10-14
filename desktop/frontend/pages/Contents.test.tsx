// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type {
  ContentItem,
  ContentTargetItem,
  ContentListResult,
} from "@/lib/api";
import {
  summarizeContent,
  safePlatformUrl,
  contentTargetMessage,
} from "@/lib/content-management";
import Contents from "./Contents";
const mocks = vi.hoisted(() => ({
  fetchContents: vi.fn(),
  fetchContent: vi.fn(),
  fetchPlatformAccounts: vi.fn(),
  submitDistribution: vi.fn(),
  deleteContent: vi.fn(),
  connect: vi.fn(),
  getStatus: vi.fn(),
  startPublish: vi.fn(),
}));

it('opens work details directly from the unified distribution queue', async () => {
  current = work([target('daily', 'failed')]);
  mocks.fetchContents.mockResolvedValue(page(current));
  mocks.fetchContent.mockResolvedValue(current);
  mocks.fetchPlatformAccounts.mockResolvedValue([]);
  render(<MemoryRouter initialEntries={['/contents?contentId=work']}><Contents /></MemoryRouter>);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('周末记录')).toBeTruthy();
  expect(mocks.fetchContent).toHaveBeenCalledWith('work');
});
vi.mock("@/lib/api", () => ({ ...mocks }));
vi.mock("@/lib/distribution", () => ({
  submitDistribution: mocks.submitDistribution,
}));
vi.mock("@/hooks/use-ui-density", () => ({
  useUiDensity: () => ({ density: "comfortable", compact: false }),
}));
vi.mock("@/components/MediaPreviewImage", () => ({
  MediaPreviewImage: () => null,
}));
function target(
  id: string,
  publishStatus: ContentTargetItem["publishStatus"],
): ContentTargetItem {
  return {
    id,
    contentId: "work",
    platformAccountId: id,
    platform: "douyin",
    overrides: {},
    publishStatus,
    hasCover: false,
    hasCoverLandscape: false,
    platformPostId: null,
    platformUrl: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}
function work(targets: ContentTargetItem[]): ContentItem {
  return {
    id: "work",
    type: "video",
    title: "周末记录",
    body: null,
    status: "published",
    hasCover: false,
    hasCoverLandscape: false,
    mediaPaths: [],
    publishedAt: "2026-10-05T12:00:00Z",
    tags: [],
    location: null,
    visibility: "public",
    scheduledAt: null,
    allowDownload: true,
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
    targets,
  };
}
function page(
  item: ContentItem,
  counts?: Partial<ContentListResult["counts"]>,
): ContentListResult {
  const status = summarizeContent(item).status;
  return {
    items: [item],
    total: 1,
    page: 1,
    pageSize: 20,
    counts: {
      all: 1,
      draft: 0,
      pending: 0,
      publishing: 0,
      needs_attention: 0,
      completed: 0,
      [status]: 1,
      ...counts,
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let current: ContentItem;
beforeEach(() => {
  vi.resetAllMocks();
  current = work([target("daily", "failed"), target("business", "succeeded")]);
  mocks.fetchContents.mockImplementation(async () => page(current));
  mocks.fetchContent.mockImplementation(async () => current);
  mocks.fetchPlatformAccounts.mockResolvedValue([
    { id: "daily", displayName: "日常分享号", platform: "douyin" },
    { id: "business", displayName: "工作记录号", platform: "douyin" },
  ]);
  mocks.getStatus.mockReturnValue("connected");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function setup() {
  render(
    <MemoryRouter>
      <Contents />
    </MemoryRouter>,
  );
  await screen.findByText("周末记录");
  return userEvent.setup();
}
async function details(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "处理问题" }));
  return screen.findByRole("dialog", { name: "周末记录" });
}

it("uses target outcomes, separates cancellation, and rejects unsafe result links", () => {
  expect(summarizeContent(work([target("a", "queued")])).label).toBe("发布中");
  expect(
    summarizeContent(work([target("a", "succeeded"), target("b", "idle")]))
      .label,
  ).toBe("部分完成");
  const cancelled = summarizeContent(work([target("a", "cancelled")]));
  expect(cancelled.line).toContain("1 已取消");
  expect(cancelled.failed).toBe(0);
  expect(safePlatformUrl("javascript:alert(1)")).toBeUndefined();
  expect(safePlatformUrl("file:///etc/passwd")).toBeUndefined();
  expect(safePlatformUrl("https://www.douyin.com/video/123")).toBe(
    "https://www.douyin.com/video/123",
  );
  expect(
    contentTargetMessage({
      ...target("a", "failed"),
      errorCode: "secret-error",
      errorMessage: "HTTP DOM secret-error",
    }),
  ).toBe("发布未成功，请稍后重试");
});

it("filters on the server and shows global counts instead of counting only visible rows", async () => {
  mocks.fetchContents.mockResolvedValue(
    page(current, { all: 42, needs_attention: 21, completed: 21 }),
  );
  const user = await setup();
  expect(screen.getByRole("button", { name: "需要处理21" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "需要处理21" }));
  await waitFor(() => {
    expect(mocks.fetchContents).toHaveBeenLastCalledWith(
      expect.objectContaining({ managementStatus: "needs_attention", page: 1 }),
    );
  });
  await user.click(screen.getByRole("button", { name: "重置" }));
  await waitFor(() => {
    expect(mocks.fetchContents).toHaveBeenLastCalledWith(
      expect.objectContaining({ managementStatus: undefined, page: 1 }),
    );
  });
});

it("shows distinct account names, result links and contextual recovery actions", async () => {
  current.targets[0].errorCode = "AUTH_EXPIRED";
  current.targets[1].platformUrl = "https://www.douyin.com/video/123";
  const user = await setup();
  const dialog = await details(user);
  expect(within(dialog).getByText(/抖音 · 日常分享号/)).toBeTruthy();
  expect(within(dialog).getByText(/抖音 · 工作记录号/)).toBeTruthy();
  expect(within(dialog).getByText("登录已失效，请重新授权后重试")).toBeTruthy();
  expect(
    within(dialog)
      .getByRole("button", { name: "去重新授权" })
      .getAttribute("href"),
  ).toBe("/platform-accounts");
  expect(
    within(dialog)
      .getByRole("button", { name: "查看平台作品" })
      .getAttribute("href"),
  ).toBe("https://www.douyin.com/video/123");
});

it("updates open details automatically, keeps rows visible, and does not rely on the opening snapshot", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  current = work([target("daily", "running")]);
  const user = await setup();
  await user.click(screen.getByRole("button", { name: "查看进度" }));
  await screen.findByRole("dialog");
  current = work([target("daily", "succeeded")]);
  current.targets[0].finishedAt = "2026-10-06T08:00:00Z";
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("成功")).toBeTruthy();
  expect(within(dialog).queryByText("发布中")).toBeNull();
  expect(screen.getAllByText("周末记录")).toHaveLength(2);
});

it("retries only the selected target and refreshes details when it disappears from the failed filter", async () => {
  const user = await setup();
  await user.click(screen.getByRole("button", { name: "需要处理1" }));
  const dialog = await details(user);
  mocks.submitDistribution.mockImplementation(async () => {
    current = work([
      target("daily", "succeeded"),
      target("business", "succeeded"),
    ]);
    mocks.fetchContents.mockResolvedValue({
      ...page(current),
      items: [],
      total: 0,
    });
  });
  await user.click(within(dialog).getByRole("button", { name: "重试" }));
  await waitFor(() => {
    expect(
      within(screen.getByRole("dialog")).getAllByText("成功"),
    ).toHaveLength(2);
  });
  expect(mocks.submitDistribution).toHaveBeenCalledExactlyOnceWith(
    "work",
    "daily",
  );
});

it("preserves rows on refresh failure and hides raw error details", async () => {
  const user = await setup();
  mocks.fetchContents.mockRejectedValueOnce(
    new Error("HTTP 500 secret-internal-code"),
  );
  await user.click(screen.getByRole("button", { name: "刷新" }));
  await screen.findByText("作品加载失败，请重试");
  expect(screen.getByText("周末记录")).toBeTruthy();
  expect(document.body.textContent).not.toContain("secret-internal-code");
});

it("discards old list responses after changing filters", async () => {
  const user = await setup();
  const stale = deferred<ContentListResult>();
  mocks.fetchContents.mockReturnValueOnce(stale.promise);
  await user.click(screen.getByRole("button", { name: "刷新" }));
  const updated = { ...current, title: "最新筛选作品" };
  mocks.fetchContents.mockResolvedValue(page(updated));
  await user.click(screen.getByRole("button", { name: "需要处理1" }));
  await screen.findByText("最新筛选作品");
  await act(async () => {
    stale.resolve(page(current));
  });
  expect(screen.queryByText("周末记录")).toBeNull();
});

it("blocks edits and deletion while publishing and sends missing media back to the editor", async () => {
  current = work([target("daily", "running")]);
  const user = await setup();
  expect(
    screen.getByRole("button", { name: "编辑" }).getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "更多操作：周末记录" })
      .hasAttribute("disabled"),
  ).toBe(true);
  current = work([
    { ...target("daily", "failed"), errorCode: "MEDIA_MISSING" },
  ]);
  fireEvent(window, new Event("focus"));
  await screen.findByRole("button", { name: "处理问题" });
  const dialog = await details(user);
  expect(
    within(dialog)
      .getByRole("button", { name: "重新选择素材" })
      .getAttribute("href"),
  ).toBe("/publish/video?id=work");
});

it("opens deletion only from the selected work's menu and keeps the confirmation step", async () => {
  const other = { ...work([]), id: "other", title: "另一条作品" };
  mocks.fetchContents.mockResolvedValue({
    ...page(current),
    items: [current, other],
    total: 2,
  });
  mocks.deleteContent.mockImplementation(async () => {
    mocks.fetchContents.mockResolvedValue(page(other));
  });
  const user = await setup();
  expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "更多操作：周末记录" }));
  await user.click(await screen.findByRole("menuitem", { name: "删除" }));
  const confirmation = await screen.findByRole("alertdialog", {
    name: "删除作品？",
  });
  expect(within(confirmation).getByText(/将删除「周末记录」/)).toBeTruthy();
  expect(mocks.deleteContent).not.toHaveBeenCalled();
  await user.click(within(confirmation).getByRole("button", { name: "取消" }));
  await waitFor(() => {
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  expect(mocks.deleteContent).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "更多操作：周末记录" }));
  await user.click(await screen.findByRole("menuitem", { name: "删除" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "删除",
    }),
  );
  await waitFor(() => {
    expect(screen.queryByText("周末记录")).toBeNull();
  });
  expect(mocks.deleteContent).toHaveBeenCalledExactlyOnceWith("work");
  expect(screen.getByText("另一条作品")).toBeTruthy();
});

it("submits a selected draft to the app queue and shows its queued state", async () => {
  current = work([target("daily", "idle")]);
  current.status = "draft";
  const user = await setup();
  mocks.submitDistribution.mockImplementation(async () => {
    current = {
      ...current,
      status: "published",
      targets: [target("daily", "queued")],
    };
    mocks.fetchContents.mockResolvedValue(page(current));
  });
  await user.click(screen.getByRole("button", { name: /更多操作/ }));
  await user.click(await screen.findByRole("menuitem", { name: "开始分发" }));
  expect(mocks.submitDistribution).toHaveBeenCalledExactlyOnceWith("work");
  await screen.findByRole("button", { name: "查看进度" });
});

it.each(["bilibili", "toutiao"] as const)(
  "offers distribution for an unsubmitted %s article after Douyin succeeds",
  async (platform) => {
    current = work([
      target("daily", "succeeded"),
      { ...target("business", "idle"), platform },
    ]);
    current.type = "article";
    mocks.submitDistribution.mockResolvedValue(undefined);
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /更多操作/ }));
    await user.click(await screen.findByRole("menuitem", { name: "开始分发" }));
    expect(mocks.submitDistribution).toHaveBeenCalledExactlyOnceWith("work");
  },
);

it("shows the platform publication limit in distribution details", async () => {
  current = work([
    {
      ...target("daily", "failed"),
      platform: "bilibili",
      errorCode: "ARTICLE_PUBLISH_LIMIT_REACHED",
      errorMessage: "今日投稿次数已用完，请额度恢复后重试",
    },
  ]);
  current.type = "article";
  const user = await setup();
  const dialog = await details(user);
  expect(
    within(dialog).getByText("今日投稿次数已用完，请额度恢复后重试"),
  ).toBeTruthy();
});
