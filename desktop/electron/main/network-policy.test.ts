import { app, session } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNetworkSession,
  getProxySettings,
  installNetworkPolicy,
  platformOutboundFetch,
  resetNetworkPolicyForTests,
  testProxySettings,
  updateProxySettings,
} from "./network-policy";
import { PROXY_BYPASS_RULES } from "../../shared/proxy-settings";

const store = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
}));

vi.mock("./proxy-settings-store", () => ({
  readProxySettings: store.read,
  saveProxySettings: store.save,
}));

beforeEach(() => {
  resetNetworkPolicyForTests();
  app.clearListeners();
  session.defaultSession.lastProxyConfig = null;
  store.read.mockReturnValue({
    enabled: false,
    host: "",
    port: null,
  });
  store.save.mockImplementation(async (_path: string, input: unknown) => input);
});

afterEach(() => {
  resetNetworkPolicyForTests();
  app.clearListeners();
});

describe("installNetworkPolicy", () => {
  it("applies direct mode and wraps fromPartition", async () => {
    installNetworkPolicy();
    await vi.waitFor(() =>
      expect(session.defaultSession.lastProxyConfig).toEqual({
        mode: "direct",
      }),
    );

    const partitionSession = session.fromPartition("temp:auth-test");
    await vi.waitFor(() =>
      expect(partitionSession.lastProxyConfig).toEqual({ mode: "direct" }),
    );

    expect(
      await testProxySettings({ host: "10.0.0.1", port: 1080 }),
    ).toEqual({ ok: true, message: "测试通过" });
    store.save.mockResolvedValue({
      enabled: true,
      host: "10.0.0.1",
      port: 1080,
    });
    await updateProxySettings({
      enabled: true,
      host: "10.0.0.1",
      port: 1080,
    });

    const expected = {
      mode: "fixed_servers",
      proxyRules: "http://10.0.0.1:1080",
      proxyBypassRules: PROXY_BYPASS_RULES,
    };
    expect(session.defaultSession.lastProxyConfig).toEqual(expected);
    expect(partitionSession.lastProxyConfig).toEqual(expected);
  });

  it("createNetworkSession awaits setProxy without web-contents", async () => {
    installNetworkPolicy();
    expect(
      await testProxySettings({ host: "10.0.0.1", port: 1080 }),
    ).toEqual({ ok: true, message: "测试通过" });
    store.save.mockResolvedValue({
      enabled: true,
      host: "10.0.0.1",
      port: 1080,
    });
    await updateProxySettings({
      enabled: true,
      host: "10.0.0.1",
      port: 1080,
    });

    const orphan = await createNetworkSession("temp:cookie-only");
    expect(orphan.lastProxyConfig).toEqual({
      mode: "fixed_servers",
      proxyRules: "http://10.0.0.1:1080",
      proxyBypassRules: PROXY_BYPASS_RULES,
    });
  });
});

describe("getProxySettings / updateProxySettings", () => {
  it("reads once from disk and allows disable without test", async () => {
    store.read.mockReturnValue({
      enabled: true,
      host: "proxy.local",
      port: 3128,
    });
    expect(getProxySettings()).toEqual({
      enabled: true,
      host: "proxy.local",
      port: 3128,
    });
    expect(store.read).toHaveBeenCalledTimes(1);

    store.save.mockResolvedValue({
      enabled: false,
      host: "proxy.local",
      port: 3128,
    });
    installNetworkPolicy();
    const saved = await updateProxySettings({
      enabled: false,
      host: "proxy.local",
      port: 3128,
    });
    expect(saved.enabled).toBe(false);
    await vi.waitFor(() =>
      expect(session.defaultSession.lastProxyConfig).toEqual({
        mode: "direct",
      }),
    );
  });

  it("rejects enabling before a successful test", async () => {
    await expect(
      updateProxySettings({
        enabled: true,
        host: "10.0.0.1",
        port: 1080,
      }),
    ).rejects.toThrow("请先测试");
    expect(store.save).not.toHaveBeenCalled();
  });
});

describe("testProxySettings", () => {
  it("falls back to the second probe when the first fails", async () => {
    const originalFromPartition = session.fromPartition.bind(session);
    let fetchCalls = 0;
    const spy = vi
      .spyOn(session, "fromPartition")
      .mockImplementation((name, options) => {
        const created = originalFromPartition(name, options);
        vi.spyOn(created, "fetch").mockImplementation(async () => {
          fetchCalls += 1;
          if (fetchCalls === 1) {
            throw new Error("first probe down");
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({}),
          };
        });
        return created;
      });

    expect(await testProxySettings({ host: "ok.proxy", port: 9 })).toEqual({
      ok: true,
      message: "测试通过",
    });
    expect(fetchCalls).toBe(2);
    spy.mockRestore();
  });

  it("fails closed when all probe fetches throw", async () => {
    const originalFromPartition = session.fromPartition.bind(session);
    const spy = vi
      .spyOn(session, "fromPartition")
      .mockImplementation((name, options) => {
        const created = originalFromPartition(name, options);
        vi.spyOn(created, "fetch").mockRejectedValue(new Error("boom"));
        return created;
      });

    expect(await testProxySettings({ host: "bad.proxy", port: 9 })).toEqual({
      ok: false,
      message: "连不上，请检查地址和端口",
    });
    spy.mockRestore();
  });
});

describe("platformOutboundFetch", () => {
  it("uses the target session fetch after applying proxy", async () => {
    installNetworkPolicy();
    const target = await createNetworkSession("temp:outbound");
    const fetchSpy = vi.spyOn(target, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as never);

    await platformOutboundFetch("https://example.com/api", { method: "GET" }, target);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/api",
      { method: "GET" },
    );
    fetchSpy.mockRestore();
  });

  it("strips Content-Length before session.fetch", async () => {
    installNetworkPolicy();
    const target = await createNetworkSession("temp:outbound-length");
    const fetchSpy = vi.spyOn(target, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as never);

    await platformOutboundFetch(
      "https://example.com/upload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": "4",
          "Content-CRC32": "abcd",
        },
      },
      target,
    );

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("content-length")).toBeNull();
    expect(headers.get("content-type")).toBe("application/octet-stream");
    expect(headers.get("content-crc32")).toBe("abcd");
    fetchSpy.mockRestore();
  });
});
