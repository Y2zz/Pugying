// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DistributionPreference } from "./DistributionPreference";

const bridge = vi.hoisted(() => ({
  getDistributionConcurrency: vi.fn(),
  setDistributionConcurrency: vi.fn(),
}));
vi.mock("@/lib/agent-client", () => ({
  getPugyingDesktopBridge: () => bridge,
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  bridge.getDistributionConcurrency.mockResolvedValue(3);
  bridge.setDistributionConcurrency.mockImplementation(
    async (value: number) => value,
  );
});

it("loads the saved limit and persists a user edit on blur", async () => {
  bridge.getDistributionConcurrency.mockResolvedValue(5);
  render(<DistributionPreference />);
  const input = screen.getByRole("spinbutton", {
    name: "同时分发数量",
  }) as HTMLInputElement;
  await waitFor(() => expect(input.value).toBe("5"));
  fireEvent.change(input, { target: { value: "2" } });
  expect(bridge.setDistributionConcurrency).not.toHaveBeenCalled();
  fireEvent.blur(input);
  await waitFor(() =>
    expect(bridge.setDistributionConcurrency).toHaveBeenCalledExactlyOnceWith(
      2,
    ),
  );
});

it.each(["0", "-1", "1.5", ""])(
  "does not save invalid concurrency %s",
  async (value) => {
    render(<DistributionPreference />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    await waitFor(() => expect(input.disabled).toBe(false));
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "请输入大于零的整数",
    );
    expect(bridge.setDistributionConcurrency).not.toHaveBeenCalled();
  },
);

it("keeps a failed setting editable and allows retry", async () => {
  bridge.setDistributionConcurrency.mockRejectedValueOnce(
    new Error("disk full"),
  );
  render(<DistributionPreference />);
  const input = screen.getByRole("spinbutton") as HTMLInputElement;
  await waitFor(() => expect(input.disabled).toBe(false));
  fireEvent.change(input, { target: { value: "4" } });
  fireEvent.blur(input);
  expect((await screen.findByRole("alert")).textContent).toBe(
    "保存失败，请重试",
  );
  fireEvent.blur(input);
  await waitFor(() =>
    expect(bridge.setDistributionConcurrency).toHaveBeenCalledTimes(2),
  );
});
