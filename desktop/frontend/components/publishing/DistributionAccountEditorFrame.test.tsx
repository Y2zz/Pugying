// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PlatformAccountItem } from "@/lib/api";
import { DistributionAccountEditorFrame } from "./DistributionAccountEditorFrame";

afterEach(cleanup);

it("恢复默认与账号信息同处顶栏，导航按钮切换到正确账号", () => {
  const entries = ["a", "b"].map((id) => ({
    account: {
      id,
      displayName: "账号 " + id,
      platform: "douyin",
      status: "active",
    } as PlatformAccountItem,
    platformLabel: "抖音",
  }));
  const reset = vi.fn();
  const navigate = vi.fn();
  render(
    <MemoryRouter>
      <DistributionAccountEditorFrame
        entries={entries}
        accountId="a"
        onNavigate={navigate}
        onReset={reset}
      >
        <input aria-label="平台字段" />
      </DistributionAccountEditorFrame>
    </MemoryRouter>,
  );
  const resetButton = screen.getByRole("button", { name: "恢复默认" });
  expect(resetButton.parentElement?.textContent).toContain("账号 a");
  fireEvent.click(resetButton);
  expect(reset).toHaveBeenCalledOnce();
  expect(
    (screen.getByRole("button", { name: "上一个账号" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "下一个账号" }));
  expect(navigate).toHaveBeenCalledWith("b");
  expect(screen.getByRole("textbox", { name: "平台字段" })).toBeTruthy();
});

it("过期账号保留重新授权引导，锁定时禁用恢复默认", () => {
  const reset = vi.fn();
  render(
    <MemoryRouter>
      <DistributionAccountEditorFrame
        entries={[
          {
            account: {
              id: "a",
              displayName: "账号",
              platform: "douyin",
              status: "expired",
            } as PlatformAccountItem,
            platformLabel: "抖音",
          },
        ]}
        accountId="a"
        onNavigate={vi.fn()}
        onReset={reset}
        disabled
      >
        <input aria-label="平台字段" disabled />
      </DistributionAccountEditorFrame>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: "去处理" }).getAttribute("href"),
  ).toBe("/platform-accounts");
  fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
  expect(reset).not.toHaveBeenCalled();
});
