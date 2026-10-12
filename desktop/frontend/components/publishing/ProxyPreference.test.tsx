// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProxyPreference } from "./ProxyPreference";

const bridge = vi.hoisted(() => ({
  getProxySettings: vi.fn(),
  setProxySettings: vi.fn(),
  testProxySettings: vi.fn(),
}));
const toastAdd = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent-client", () => ({
  getPugyingDesktopBridge: () => bridge,
}));
vi.mock("@/components/AppToaster", () => ({
  toast: { add: toastAdd },
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  bridge.getProxySettings.mockResolvedValue({
    enabled: false,
    host: "",
    port: null,
  });
  bridge.setProxySettings.mockImplementation(async (value) => value);
  bridge.testProxySettings.mockResolvedValue({
    ok: true,
    message: "测试通过",
  });
});

it("keeps host/port editable while switch is off", async () => {
  bridge.getProxySettings.mockResolvedValue({
    enabled: false,
    host: "proxy.example",
    port: 8080,
  });
  render(<ProxyPreference />);
  const host = (await screen.findByLabelText("服务器地址")) as HTMLInputElement;
  await waitFor(() => expect(host.value).toBe("proxy.example"));
  expect(host.disabled).toBe(false);
  expect(screen.getByLabelText("端口")).toHaveProperty("disabled", false);
});

it("treats switch and field edits as draft until Apply", async () => {
  const user = userEvent.setup();
  bridge.getProxySettings.mockResolvedValue({
    enabled: false,
    host: "proxy.example",
    port: 8080,
  });
  render(<ProxyPreference />);
  const host = (await screen.findByLabelText("服务器地址")) as HTMLInputElement;
  await waitFor(() => expect(host.disabled).toBe(false));
  await user.click(screen.getByRole("switch", { name: "启用代理" }));
  fireEvent.change(host, { target: { value: "new.example" } });
  expect(bridge.setProxySettings).not.toHaveBeenCalled();
  expect(bridge.testProxySettings).not.toHaveBeenCalled();
});

it("auto-enables the switch after a successful test, then Apply persists", async () => {
  const user = userEvent.setup();
  bridge.getProxySettings.mockResolvedValue({
    enabled: false,
    host: "proxy.example",
    port: 8080,
  });
  render(<ProxyPreference />);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("服务器地址") as HTMLInputElement).disabled,
    ).toBe(false),
  );
  expect(
    screen.getByRole("switch", { name: "启用代理" }).getAttribute("aria-checked"),
  ).toBe("false");
  expect(screen.getByRole("button", { name: "应用" })).toHaveProperty(
    "disabled",
    true,
  );
  await user.click(screen.getByRole("button", { name: "测试" }));
  await waitFor(() =>
    expect(bridge.testProxySettings).toHaveBeenCalledExactlyOnceWith({
      host: "proxy.example",
      port: 8080,
    }),
  );
  await waitFor(() =>
    expect(toastAdd).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "测试通过",
    }),
  );
  expect(
    screen.getByRole("switch", { name: "启用代理" }).getAttribute("aria-checked"),
  ).toBe("true");
  const apply = screen.getByRole("button", { name: "应用" });
  expect(apply).toHaveProperty("disabled", false);
  await user.click(apply);
  await waitFor(() =>
    expect(bridge.setProxySettings).toHaveBeenCalledExactlyOnceWith({
      enabled: true,
      host: "proxy.example",
      port: 8080,
    }),
  );
});

it("allows apply without test when turning off", async () => {
  const user = userEvent.setup();
  bridge.getProxySettings.mockResolvedValue({
    enabled: true,
    host: "proxy.example",
    port: 8080,
  });
  render(<ProxyPreference />);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("服务器地址") as HTMLInputElement).disabled,
    ).toBe(false),
  );
  await user.click(screen.getByRole("switch", { name: "启用代理" }));
  expect(bridge.testProxySettings).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "应用" }));
  await waitFor(() =>
    expect(bridge.setProxySettings).toHaveBeenCalledExactlyOnceWith({
      enabled: false,
      host: "proxy.example",
      port: 8080,
    }),
  );
});

it("clears verification when host changes", async () => {
  const user = userEvent.setup();
  bridge.getProxySettings.mockResolvedValue({
    enabled: false,
    host: "proxy.example",
    port: 8080,
  });
  render(<ProxyPreference />);
  const host = (await screen.findByLabelText("服务器地址")) as HTMLInputElement;
  await waitFor(() => expect(host.disabled).toBe(false));
  await user.click(screen.getByRole("button", { name: "测试" }));
  await waitFor(() => expect(toastAdd).toHaveBeenCalled());
  fireEvent.change(host, { target: { value: "other.example" } });
  expect(screen.getByRole("button", { name: "应用" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(bridge.setProxySettings).not.toHaveBeenCalled();
});

it("shows test failure without enabling the switch", async () => {
  const user = userEvent.setup();
  bridge.testProxySettings.mockResolvedValue({
    ok: false,
    message: "连不上，请检查地址和端口",
  });
  bridge.getProxySettings.mockResolvedValue({
    enabled: false,
    host: "proxy.example",
    port: 8080,
  });
  render(<ProxyPreference />);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("服务器地址") as HTMLInputElement).disabled,
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "测试" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "连不上，请检查地址和端口",
  );
  expect(
    screen.getByRole("switch", { name: "启用代理" }).getAttribute("aria-checked"),
  ).toBe("false");
  expect(toastAdd).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "应用" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(bridge.setProxySettings).not.toHaveBeenCalled();
});
