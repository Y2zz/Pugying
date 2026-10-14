/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlatformResourcePicker } from "./PlatformResourcePicker";

describe("PlatformResourcePicker", () => {
  it("only adds items chosen from search suggestions", async () => {
    const search = vi.fn(async () => [{ id: "9", name: "日常" }]);
    const onChange = vi.fn();
    render(
      <PlatformResourcePicker
        label="话题"
        value={[]}
        onChange={onChange}
        search={search}
        maxCount={5}
        placeholder="搜索话题"
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("话题"), "日");
    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("日");
    });
    await user.click(await screen.findByRole("button", { name: /日常/ }));
    expect(onChange).toHaveBeenCalledWith([{ id: "9", name: "日常" }]);
  });

  it("shows selected summary when collapsed", () => {
    render(
      <PlatformResourcePicker
        label="合集"
        value={[{ id: "1", name: "旅行记" }]}
        onChange={vi.fn()}
        search={async () => []}
        collapsedByDefault
      />,
    );
    expect(
      screen.getByRole("button", { name: /合集.*#旅行记/ }),
    ).toBeTruthy();
  });

  it("shows an actionable empty summary when collapsed", () => {
    render(
      <PlatformResourcePicker
        label="位置"
        value={[]}
        onChange={vi.fn()}
        search={async () => []}
        collapsedByDefault
        emptySummary="添加位置"
      />,
    );
    expect(
      screen.getByRole("button", { name: /位置.*添加位置/ }),
    ).toBeTruthy();
  });

  it("loads account list candidates when browseOnEmpty is enabled", async () => {
    const search = vi.fn(async () => [{ id: "2", name: "旅行 vlog" }]);
    render(
      <PlatformResourcePicker
        label="合集"
        value={[]}
        onChange={vi.fn()}
        search={search}
        collapsedByDefault
        browseOnEmpty
        emptySummary="加入合集"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /合集.*加入合集/ }));
    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("");
    });
    expect(await screen.findByRole("button", { name: /旅行 vlog/ })).toBeTruthy();
  });
});
