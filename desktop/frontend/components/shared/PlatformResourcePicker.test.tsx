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
    expect(screen.getByText("#旅行记")).toBeTruthy();
  });
});
