// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  DistributionAccountsPanel,
  type DistributionAccountEntry,
} from "./DistributionAccountsPanel";
import type { PlatformAccountItem } from "@/lib/api";

const entry = (
  id: string,
  name: string,
  status = "active",
): DistributionAccountEntry => ({
  account: {
    id,
    displayName: name,
    platformUserId: id,
    platform: "douyin",
    status,
  } as PlatformAccountItem,
  platformLabel: "抖音",
});
const entries = [
  entry("a", "甲账号"),
  entry("b", "乙账号"),
  entry("c", "失效账号", "expired"),
];

afterEach(cleanup);

function setup({
  initial = entries,
  disabled = false,
  accountsEmpty = false,
  bulk = true,
} = {}) {
  const remove = vi.fn();
  const edit = vi.fn();
  const focus = vi.fn();
  const add = vi.fn();
  function Harness() {
    const [list, setList] = useState(initial);
    const [focused, setFocused] = useState<string | null>(null);
    return (
      <DistributionAccountsPanel
        entries={list}
        accountsEmpty={accountsEmpty}
        disabled={disabled}
        focusedAccountId={focused}
        onFocusAccount={(id) => {
          setFocused(id);
          focus(id);
        }}
        onAdd={add}
        onRemove={(ids) => {
          remove(ids);
          setList((prev) => prev.filter((e) => !ids.includes(e.account.id)));
        }}
        onBulkEdit={bulk ? edit : undefined}
        renderStatus={({ account }) => (
          <span>{account.status === "active" ? "可发布" : "需重新授权"}</span>
        )}
      >
        <div data-testid="editor">{focused}</div>
      </DistributionAccountsPanel>
    );
  }
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
  return { remove, edit, focus, add };
}

it("搜索后全选仅选择可见账号，清除搜索不丢失选择", () => {
  const { edit } = setup();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索账号" }), {
    target: { value: "乙" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "全选" }));
  fireEvent.click(screen.getByRole("button", { name: "批量设置" }));
  expect(edit).toHaveBeenCalledWith(["b"]);
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(
    screen
      .getByRole("checkbox", { name: "选择 乙账号" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen.getByRole("checkbox", { name: "全选" }).getAttribute("aria-checked"),
  ).toBe("mixed");
});

it("批量移除后清理选择并自动切换到剩余账号", async () => {
  const { remove } = setup();
  fireEvent.click(screen.getByRole("checkbox", { name: "选择 甲账号" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "选择 乙账号" }));
  fireEvent.click(screen.getByRole("button", { name: "移除", exact: true }));
  expect(remove).toHaveBeenCalledWith(["a", "b"]);
  await waitFor(() =>
    expect(screen.getByTestId("editor").textContent).toBe("c"),
  );
  expect(screen.queryByRole("button", { name: "批量设置" })).toBeNull();
});

it("发布期间禁止选择、批量操作和移除，但可以查看账号设置", () => {
  const { remove, focus } = setup({ disabled: true });
  fireEvent.click(screen.getByRole("checkbox", { name: "全选" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "选择 甲账号" }));
  fireEvent.click(screen.getByRole("button", { name: "移除 甲账号" }));
  expect(remove).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "批量设置" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /乙账号.*可发布/ }));
  expect(focus).toHaveBeenLastCalledWith("b");
  expect(
    (screen.getByRole("button", { name: "添加账号" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("无分发账号显示添加入口，无绑定账号显示绑定引导", () => {
  const { add } = setup({ initial: [] });
  fireEvent.click(screen.getByRole("button", { name: "添加账号" }));
  expect(add).toHaveBeenCalledOnce();
  cleanup();
  setup({ initial: [], accountsEmpty: true });
  expect(screen.getByRole("button", { name: "去绑定账号" })).toBeTruthy();
});

it("未提供批量设置时仍能批量移除，状态由页面提供", () => {
  const { remove } = setup({ bulk: false });
  expect(screen.getByText("需重新授权")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "全选" }));
  expect(screen.queryByRole("button", { name: "批量设置" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "移除", exact: true }));
  expect(remove).toHaveBeenCalledWith(["a", "b", "c"]);
});
