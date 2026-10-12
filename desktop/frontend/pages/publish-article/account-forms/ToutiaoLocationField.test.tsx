/** @vitest-environment jsdom */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { ToutiaoLocationField } from "./ToutiaoLocationField";

const search = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent-client", () => ({
  getPugyingDesktopBridge: () => ({ searchToutiaoLocations: search }),
}));

beforeEach(() => {
  search.mockReset();
});

afterEach(cleanup);

function Form({
  accountId = "acc",
  initial = [] as PlatformResourceRef[],
}: {
  accountId?: string;
  initial?: PlatformResourceRef[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <ToutiaoLocationField
      accountId={accountId}
      value={value}
      onChange={setValue}
    />
  );
}

describe("ToutiaoLocationField", () => {
  it("loads cities once and filters locally", async () => {
    search.mockResolvedValue([
      { id: "330100", name: "杭州" },
      { id: "310100", name: "上海" },
      { id: "110100", name: "北京" },
    ]);
    const user = userEvent.setup();
    render(<Form />);
    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("acc", "");
    });
    expect(search).toHaveBeenCalledTimes(1);
    const input = await screen.findByPlaceholderText("选择城市");
    await user.click(input);
    expect(await screen.findByRole("option", { name: "杭州" })).toBeTruthy();
    await user.type(input, "杭");
    const list = await screen.findByRole("listbox");
    expect(within(list).getByRole("option", { name: "杭州" })).toBeTruthy();
    expect(within(list).queryByRole("option", { name: "上海" })).toBeNull();
  });

  it("selects a city and allows clearing", async () => {
    search.mockResolvedValue([
      { id: "330100", name: "杭州" },
      { id: "310100", name: "上海" },
    ]);
    const user = userEvent.setup();
    render(<Form />);
    const input = await screen.findByPlaceholderText("选择城市");
    await waitFor(() => {
      expect((input as HTMLInputElement).disabled).toBe(false);
    });
    await user.click(input);
    await user.click(await screen.findByRole("option", { name: "杭州" }));
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe("杭州");
    });
    // Clear 控件无文字标签，位于 input-group 尾部
    const clear = document.querySelector(
      '[data-slot="combobox-clear"]',
    ) as HTMLElement | null;
    expect(clear).toBeTruthy();
    await user.click(clear!);
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe("");
    });
  });

  it("shows a restrained failure hint when loading cities fails", async () => {
    search.mockRejectedValue(new Error("boom"));
    render(<Form />);
    expect(await screen.findByText("暂时无法加载，请稍后重试")).toBeTruthy();
    expect(
      (screen.getByPlaceholderText("选择城市") as HTMLInputElement).disabled,
    ).toBe(true);
  });
});
