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
import type { PlatformAccountItem } from "@/lib/api";
import { PLATFORM_ACCOUNT_SYNCED_EVENT } from "@/hooks/use-creator-window-sync";
import PlatformAccounts from "./PlatformAccounts";

const mocks = vi.hoisted(() => ({
  fetchPlatformCatalog: vi.fn(),
  fetchPlatformAccounts: vi.fn(),
  bindPlatformAccount: vi.fn(),
  reauthPlatformAccount: vi.fn(),
  renamePlatformAccount: vi.fn(),
  deletePlatformAccount: vi.fn(),
  fetchPlatformAccountCredentials: vi.fn(),
  startPlatformAuth: vi.fn(),
  cancelPlatformAuth: vi.fn(),
  openCreatorCenter: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ ...mocks }));
vi.mock("@/lib/agent-client", () => ({
  agentClient: mocks,
  getPugyingDesktopBridge: () => ({}),
}));
vi.mock("@/hooks/use-agent", () => ({ useAgent: () => ({ connected: true }) }));
vi.mock("@/components/AppToaster", () => ({ toast: { add: mocks.toast } }));
const catalog = [
  { id: "douyin", displayName: "抖音", loginUrl: "" },
  { id: "bilibili", displayName: "哔哩哔哩", loginUrl: "" },
];
function account(
  id: string,
  platform: PlatformAccountItem["platform"] = "douyin",
  status: PlatformAccountItem["status"] = "active",
): PlatformAccountItem {
  return {
    id,
    platform,
    displayName: `账号${id}`,
    platformUserId: `user-${id}`,
    platformNickname: `昵称${id}`,
    avatarUrl: null,
    status,
    lastAuthedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}
const initialAccounts = [
  account("a"),
  account("b", "bilibili"),
  account("c", "douyin", "expired"),
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.fetchPlatformCatalog.mockResolvedValue(catalog);
  mocks.fetchPlatformAccounts.mockResolvedValue(initialAccounts);
  Object.defineProperty(HTMLElement.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
});
async function setup() {
  render(<PlatformAccounts />);
  await screen.findByText("共 3 个账号 · 第 1 / 1 页");
  return userEvent.setup();
}
function card(id: string) {
  return document.getElementById(`account-${id}`)!;
}
async function chooseStatus(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole("combobox", { name: "授权状态" }));
  await user.click(await screen.findByRole("option", { name }));
}
async function openManage(
  user: ReturnType<typeof userEvent.setup>,
  id: string,
  action: string,
) {
  await user.click(screen.getByRole("button", { name: `管理账号：账号${id}` }));
  await user.click(await screen.findByRole("menuitem", { name: action }));
}

it("combines platform, status, and nickname search without refetching and identifies each account", async () => {
  const user = await setup();
  expect(within(card("a")).getByText("抖音")).toBeTruthy();
  expect(within(card("a")).getByText("账号 ID：user-a")).toBeTruthy();
  expect(within(card("a")).getByText("平台昵称：昵称a")).toBeTruthy();
  await user.click(screen.getByRole("combobox", { name: "平台" }));
  await user.click(await screen.findByRole("option", { name: "抖音" }));
  await chooseStatus(user, "需重新授权");
  expect(screen.getByText("共 1 个账号 · 第 1 / 1 页")).toBeTruthy();
  expect(document.getElementById("account-a")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索账号" }), {
    target: { value: "昵称c" },
  });
  expect(card("c")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索账号" }), {
    target: { value: "user-a" },
  });
  expect(screen.getByText("未找到匹配账号")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "查看全部账号" }));
  expect(screen.getByText("共 3 个账号 · 第 1 / 1 页")).toBeTruthy();
  expect(mocks.fetchPlatformAccounts).toHaveBeenCalledTimes(1);
});
it("retries initial loading failure without showing an empty state or internal error", async () => {
  mocks.fetchPlatformAccounts.mockRejectedValueOnce(
    new Error("HTTP 500 secret-internal-code"),
  );
  render(<PlatformAccounts />);
  await screen.findByText("账号加载失败，请重试");
  expect(screen.queryByText("暂无媒体账号")).toBeNull();
  expect(document.body.textContent).not.toContain("secret-internal-code");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByText("共 3 个账号 · 第 1 / 1 页");
});
it("keeps loaded accounts visible during refresh and on failure", async () => {
  await setup();
  const refresh = deferred<PlatformAccountItem[]>();
  mocks.fetchPlatformAccounts.mockReturnValueOnce(refresh.promise);
  fireEvent.click(screen.getByRole("button", { name: "刷新" }));
  expect(card("a")).toBeTruthy();
  expect(screen.queryByLabelText("正在加载账号")).toBeNull();
  await act(async () => {
    refresh.resolve(initialAccounts);
  });
  mocks.fetchPlatformAccounts.mockRejectedValueOnce(
    new Error("connection failed"),
  );
  fireEvent.click(screen.getByRole("button", { name: "刷新" }));
  await screen.findByText("账号加载失败，请重试");
  expect(card("a")).toBeTruthy();
});
it("cancels authorization without binding a late success result", async () => {
  const user = await setup();
  const pending = deferred<{
    ok: boolean;
    cookies: unknown[];
    profile: { platformUserId: string; nickname: string };
  }>();
  mocks.startPlatformAuth.mockReturnValue(pending.promise);
  await user.click(within(card("c")).getByRole("button", { name: "重新授权" }));
  await screen.findByRole("dialog", { name: "正在重新授权" });
  await user.click(screen.getByRole("button", { name: "退出授权" }));
  expect(mocks.cancelPlatformAuth).toHaveBeenCalledWith(
    expect.stringMatching(/^auth-/),
  );
  await act(async () => {
    pending.resolve({
      ok: true,
      cookies: [{ name: "session", value: "cookie" }],
      profile: { platformUserId: "user-c", nickname: "新昵称" },
    });
  });
  expect(mocks.reauthPlatformAccount).not.toHaveBeenCalled();
  expect(mocks.bindPlatformAccount).not.toHaveBeenCalled();
});
it("shows an identity mismatch on the original card and allows retry", async () => {
  const user = await setup();
  mocks.startPlatformAuth.mockResolvedValue({
    ok: true,
    cookies: [{ name: "session", value: "cookie" }],
    profile: { platformUserId: "other-user", nickname: "另一个账号" },
  });
  mocks.reauthPlatformAccount.mockRejectedValue(
    new Error("登录账号与原账号不同，请使用原账号重新授权"),
  );
  await user.click(within(card("c")).getByRole("button", { name: "重新授权" }));
  await waitFor(() => {
    expect(
      within(card("c")).getByText("登录账号与原账号不同，请使用原账号重新授权"),
    ).toBeTruthy();
  });
  expect(within(card("c")).getByText("需重新授权")).toBeTruthy();
  expect(
    within(card("c"))
      .getByRole("button", { name: "重新授权" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
it("reveals a successfully reauthorized account even when filters would exclude it, without an extra success dialog", async () => {
  const user = await setup();
  await chooseStatus(user, "需重新授权");
  const updated = {
    ...initialAccounts[2]!,
    status: "active" as const,
    platformNickname: "新昵称",
  };
  mocks.startPlatformAuth.mockResolvedValue({
    ok: true,
    cookies: [{ name: "session", value: "cookie" }],
    profile: { platformUserId: "user-c", nickname: "新昵称" },
  });
  const saving = deferred<PlatformAccountItem>();
  mocks.reauthPlatformAccount.mockReturnValue(saving.promise);
  await user.click(within(card("c")).getByRole("button", { name: "重新授权" }));
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "退出授权" }).hasAttribute("disabled"),
    ).toBe(true);
  });
  mocks.fetchPlatformAccounts.mockResolvedValue([
    initialAccounts[0],
    initialAccounts[1],
    updated,
  ]);
  await act(async () => {
    saving.resolve(updated);
  });
  await waitFor(() => {
    expect(card("c").getAttribute("data-highlighted")).toBe("true");
  });
  expect(
    within(card("c")).getByRole("button", { name: "创作者中心" }),
  ).toBeTruthy();
  expect(screen.getByText("共 3 个账号 · 第 1 / 1 页")).toBeTruthy();
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(mocks.toast).toHaveBeenCalledWith({
    type: "success",
    title: "已重新授权",
  });
});
it("keeps rename errors in the dialog and prevents stale refresh data from overwriting a successful rename", async () => {
  const user = await setup();
  const staleRefresh = deferred<PlatformAccountItem[]>();
  mocks.fetchPlatformAccounts.mockReturnValueOnce(staleRefresh.promise);
  act(() => {
    window.dispatchEvent(new Event(PLATFORM_ACCOUNT_SYNCED_EVENT));
  });
  await openManage(user, "a", "修改名称");
  fireEvent.change(screen.getByRole("textbox", { name: "账号名称" }), {
    target: { value: "工作号" },
  });
  mocks.renamePlatformAccount.mockRejectedValueOnce(
    new Error("Request failed (500)"),
  );
  await user.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText("名称修改失败，请重试");
  expect(screen.getByRole("dialog", { name: "修改名称" })).toBeTruthy();
  mocks.renamePlatformAccount.mockResolvedValueOnce({
    ...initialAccounts[0],
    displayName: "工作号",
  });
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  await act(async () => {
    staleRefresh.resolve(initialAccounts);
  });
  expect(within(card("a")).getByText("工作号")).toBeTruthy();
  expect(within(card("a")).getByText("平台昵称：昵称a")).toBeTruthy();
});
it("keeps removal errors in the confirmation and removes only the selected account after retry", async () => {
  const user = await setup();
  await openManage(user, "a", "移除账号");
  expect(
    screen.getByRole("alertdialog", { name: "移除媒体账号？" }),
  ).toBeTruthy();
  expect(screen.getByText(/不会注销平台账号/)).toBeTruthy();
  mocks.deletePlatformAccount.mockRejectedValueOnce(new Error("failure"));
  await user.click(screen.getByRole("button", { name: "移除" }));
  await screen.findByText("账号移除失败，请重试");
  mocks.deletePlatformAccount.mockResolvedValueOnce(undefined);
  await user.click(screen.getByRole("button", { name: "移除" }));
  await screen.findByText("共 2 个账号 · 第 1 / 1 页");
  expect(document.getElementById("account-a")).toBeNull();
  expect(card("b")).toBeTruthy();
});
it("puts creator-center failure on the correct card without exposing unknown codes", async () => {
  const user = await setup();
  mocks.fetchPlatformAccountCredentials.mockResolvedValue({
    platform: "douyin",
    openUrl: "",
    cookies: [],
  });
  mocks.openCreatorCenter.mockResolvedValue({
    ok: false,
    error: "secret_error_code",
  });
  await user.click(
    within(card("a")).getByRole("button", { name: "创作者中心" }),
  );
  await waitFor(() => {
    expect(
      within(card("a")).getByText("打开创作者中心失败，请重试"),
    ).toBeTruthy();
  });
  expect(document.body.textContent).not.toContain("secret_error_code");
  expect(
    within(card("b")).queryByText("打开创作者中心失败，请重试"),
  ).toBeNull();
});

it("offers adding an account directly from the empty list", async () => {
  mocks.fetchPlatformAccounts.mockResolvedValue([]);
  render(<PlatformAccounts />);
  await screen.findByText("暂无媒体账号");
  const user = userEvent.setup();
  const empty = screen
    .getByText("暂无媒体账号")
    .closest('[data-slot="empty"]')!;
  await user.click(
    within(empty as HTMLElement).getByRole("button", { name: "添加账号" }),
  );
  expect(await screen.findByRole("menuitem", { name: "抖音" })).toBeTruthy();
});

it("adds an account, clears an unrelated search, and highlights it without requiring a success confirmation", async () => {
  const user = await setup();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索账号" }), {
    target: { value: "user-b" },
  });
  const added = account("new");
  mocks.startPlatformAuth.mockResolvedValue({
    ok: true,
    cookies: [{ name: "session", value: "cookie" }],
    profile: { platformUserId: "user-new", nickname: "账号new" },
  });
  mocks.bindPlatformAccount.mockResolvedValue(added);
  mocks.fetchPlatformAccounts.mockResolvedValue([added, ...initialAccounts]);
  await user.click(screen.getByRole("button", { name: "添加账号" }));
  await user.click(await screen.findByRole("menuitem", { name: "抖音" }));
  await waitFor(() => {
    expect(card("new").getAttribute("data-highlighted")).toBe("true");
  });
  expect(screen.getByText("共 4 个账号 · 第 1 / 1 页")).toBeTruthy();
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(mocks.toast).toHaveBeenCalledWith({
    type: "success",
    title: "账号已添加",
  });
});

it("offers naming a newly added account whose nickname is unavailable", async () => {
  const user = await setup();
  const added = {
    ...account("new"),
    displayName: "user-new",
    platformNickname: null,
  };
  mocks.startPlatformAuth.mockResolvedValue({
    ok: true,
    cookies: [{ name: "session", value: "cookie" }],
    profile: { platformUserId: "user-new" },
  });
  mocks.bindPlatformAccount.mockResolvedValue(added);
  mocks.fetchPlatformAccounts.mockResolvedValue([added, ...initialAccounts]);
  await user.click(screen.getByRole("button", { name: "添加账号" }));
  await user.click(await screen.findByRole("menuitem", { name: "抖音" }));
  const suggestion = await screen.findByRole("dialog", {
    name: "设置账号名称",
  });
  await user.click(
    within(suggestion).getByRole("button", { name: "修改名称" }),
  );
  await screen.findByRole("dialog", { name: "修改名称" });
  expect(
    (screen.getByRole("textbox", { name: "账号名称" }) as HTMLInputElement)
      .value,
  ).toBe("user-new");
});

function pagedAccounts(
  count: number,
  status: PlatformAccountItem["status"] = "active",
) {
  return Array.from({ length: count }, (_, index) =>
    account(
      `page-${index + 1}`,
      index % 2 === 0 ? "douyin" : "bilibili",
      status,
    ),
  );
}
async function setupPagination(rows: PlatformAccountItem[]) {
  mocks.fetchPlatformAccounts.mockResolvedValue(rows);
  render(<PlatformAccounts />);
  await screen.findByText(
    `共 ${rows.length} 个账号 · 第 1 / ${Math.ceil(rows.length / 12)} 页`,
  );
  return userEvent.setup();
}
function pageSummary() {
  return screen.getByRole("status", { name: "分页信息" });
}

it("shows 12 accounts per page with total and page information, and navigates without fetching again", async () => {
  const user = await setupPagination(pagedAccounts(28));
  expect(document.querySelectorAll('[id^="account-page-"]')).toHaveLength(12);
  expect(pageSummary().textContent).toBe("共 28 个账号 · 第 1 / 3 页");
  expect(screen.getAllByRole("status")).toHaveLength(1);
  const pagination = screen.getByRole("navigation", { name: "账号分页" });
  expect(
    within(pagination)
      .getByRole("button", { name: "上一页" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    within(pagination).getByRole("button", { name: "上一页" }).tabIndex,
  ).toBe(-1);
  await user.click(within(pagination).getByRole("button", { name: "下一页" }));
  expect(pageSummary().textContent).toBe("共 28 个账号 · 第 2 / 3 页");
  expect(card("page-13")).toBeTruthy();
  expect(
    within(pagination)
      .getByRole("button", { name: "第 2 页" })
      .getAttribute("aria-current"),
  ).toBe("page");
  await user.click(within(pagination).getByRole("button", { name: "第 3 页" }));
  expect(document.querySelectorAll('[id^="account-page-"]')).toHaveLength(4);
  expect(pageSummary().textContent).toBe("共 28 个账号 · 第 3 / 3 页");
  expect(
    within(pagination)
      .getByRole("button", { name: "下一页" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(mocks.fetchPlatformAccounts).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("textbox", { name: "搜索账号" }), {
    target: { value: "user-page-1" },
  });
  expect(pageSummary().textContent).toBe("共 11 个账号 · 第 1 / 1 页");
  expect(screen.queryByRole("navigation", { name: "账号分页" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "重置" }));
  await user.click(screen.getByRole("button", { name: "第 3 页" }));
  await user.click(screen.getByRole("combobox", { name: "平台" }));
  await user.click(await screen.findByRole("option", { name: "抖音" }));
  expect(pageSummary().textContent).toBe("共 14 个账号 · 第 1 / 2 页");
});

it("moves to the preceding valid page after removing the only account on the last page and keeps that page on refresh", async () => {
  const rows = pagedAccounts(13);
  const user = await setupPagination(rows);
  await user.click(screen.getByRole("button", { name: "第 2 页" }));
  await openManage(user, "page-13", "移除账号");
  mocks.deletePlatformAccount.mockResolvedValue(undefined);
  await user.click(screen.getByRole("button", { name: "移除" }));
  await waitFor(() => {
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  expect(pageSummary().textContent).toBe("共 12 个账号 · 第 1 / 1 页");
  expect(card("page-1")).toBeTruthy();
  const refreshed = [...rows.slice(0, 12), account("page-14")];
  mocks.fetchPlatformAccounts.mockResolvedValue(refreshed);
  await user.click(screen.getByRole("button", { name: "刷新" }));
  await waitFor(() => {
    expect(pageSummary().textContent).toBe("共 13 个账号 · 第 1 / 2 页");
  });
});

it("reveals a reauthorized account on its correct page after clearing an authorization filter", async () => {
  const rows = pagedAccounts(28, "expired");
  const user = await setupPagination(rows);
  await chooseStatus(user, "需重新授权");
  await user.click(screen.getByRole("button", { name: "第 2 页" }));
  const updated = { ...rows[22]!, status: "active" as const };
  mocks.startPlatformAuth.mockResolvedValue({
    ok: true,
    cookies: [{ name: "session", value: "cookie" }],
    profile: {
      platformUserId: updated.platformUserId,
      nickname: updated.displayName,
    },
  });
  mocks.reauthPlatformAccount.mockResolvedValue(updated);
  mocks.fetchPlatformAccounts.mockResolvedValue(
    rows.map((item) => (item.id === updated.id ? updated : item)),
  );
  await user.click(
    within(card("page-23")).getByRole("button", { name: "重新授权" }),
  );
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(pageSummary().textContent).toBe("共 28 个账号 · 第 2 / 3 页");
  expect(card("page-23").getAttribute("data-highlighted")).toBe("true");
  expect(
    within(card("page-23")).getByRole("button", { name: "创作者中心" }),
  ).toBeTruthy();
});

it("moves to the new account page when adding from the last page", async () => {
  const rows = pagedAccounts(28);
  const user = await setupPagination(rows);
  await user.click(screen.getByRole("button", { name: "第 3 页" }));
  const added = account("new");
  mocks.startPlatformAuth.mockResolvedValue({
    ok: true,
    cookies: [{ name: "session", value: "cookie" }],
    profile: {
      platformUserId: added.platformUserId,
      nickname: added.displayName,
    },
  });
  mocks.bindPlatformAccount.mockResolvedValue(added);
  mocks.fetchPlatformAccounts.mockResolvedValue([added, ...rows]);
  await user.click(screen.getByRole("button", { name: "添加账号" }));
  await user.click(await screen.findByRole("menuitem", { name: "抖音" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(pageSummary().textContent).toBe("共 29 个账号 · 第 1 / 3 页");
  expect(card("new").getAttribute("data-highlighted")).toBe("true");
});
