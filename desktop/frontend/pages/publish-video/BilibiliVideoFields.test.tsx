// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BilibiliVideoFields } from "./BilibiliVideoFields";
import type { BilibiliVideoSettings } from "@shared/bilibili-video-settings";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent-client", () => ({
  getPugyingDesktopBridge: () => ({ getBilibiliVideoOptions: read }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function Form() {
  const [value, setValue] = useState<BilibiliVideoSettings>({
    partitionId: 21,
    copyright: 1,
  });
  return (
    <>
      <BilibiliVideoFields
        accountId="account"
        value={value}
        onChange={setValue}
      />
      <output data-testid="settings">{JSON.stringify(value)}</output>
    </>
  );
}
it("loads account choices and saves copyright/source without losing partition", async () => {
  read.mockResolvedValue({
    partitions: [{ id: 21, name: "日常", group: "生活" }],
    declarations: [{ id: 123, content: "含AI生成内容" }],
  });
  render(<Form />);
  await waitFor(() =>
    expect(screen.queryByText("正在读取投稿选项…")).toBeNull(),
  );
  expect(read).toHaveBeenCalledWith("account");
  fireEvent.click(screen.getByRole("radio", { name: "转载" }));
  fireEvent.change(screen.getByLabelText("转载来源"), {
    target: { value: "original source" },
  });
  expect(JSON.parse(screen.getByTestId("settings").textContent!)).toEqual({
    partitionId: 21,
    copyright: 2,
    source: "original source",
  });
  expect(screen.getByLabelText("分区")).toBeTruthy();
  expect(screen.getByLabelText("创作声明")).toBeTruthy();
});
it("failed account options offer retry without silently fabricating choices", async () => {
  read
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ partitions: [], declarations: [] });
  render(<Form />);
  await screen.findByText("暂时无法读取投稿选项");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByText("暂时无法读取投稿选项")).toBeNull(),
  );
  expect(
    JSON.parse(screen.getByTestId("settings").textContent!).partitionId,
  ).toBe(21);
});
