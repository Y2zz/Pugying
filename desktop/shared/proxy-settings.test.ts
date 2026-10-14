import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROXY_SETTINGS,
  PROXY_BYPASS_RULES,
  parseProxySettings,
  toElectronProxyConfig,
  validateProxyEndpointForTest,
  validateProxySettingsForSave,
} from "./proxy-settings";

describe("parseProxySettings", () => {
  it("returns defaults for missing or corrupt input", () => {
    expect(parseProxySettings(null)).toEqual(DEFAULT_PROXY_SETTINGS);
    expect(parseProxySettings("x")).toEqual(DEFAULT_PROXY_SETTINGS);
  });

  it("keeps host/port when disabled", () => {
    expect(
      parseProxySettings({
        enabled: false,
        host: "proxy.example",
        port: 8080,
      }),
    ).toEqual({
      enabled: false,
      host: "proxy.example",
      port: 8080,
    });
  });
});

describe("validateProxySettingsForSave", () => {
  it("allows empty host/port when disabled", () => {
    expect(
      validateProxySettingsForSave({ enabled: false, host: "", port: null }),
    ).toEqual({ enabled: false, host: "", port: null });
  });

  it("requires host and port when enabled", () => {
    expect(() =>
      validateProxySettingsForSave({
        enabled: true,
        host: "",
        port: 8080,
      }),
    ).toThrow("请输入服务器地址");
    expect(() =>
      validateProxySettingsForSave({
        enabled: true,
        host: "proxy.example",
        port: null,
      }),
    ).toThrow("请输入端口");
  });

  it("rejects invalid host or port", () => {
    expect(() =>
      validateProxySettingsForSave({
        enabled: true,
        host: "http://proxy.example",
        port: 8080,
      }),
    ).toThrow("请输入有效的服务器地址");
    expect(() =>
      validateProxySettingsForSave({
        enabled: true,
        host: "proxy.example",
        port: 0,
      }),
    ).toThrow("请输入 1–65535 之间的端口");
  });
});

describe("validateProxyEndpointForTest", () => {
  it("requires host and port regardless of enabled", () => {
    expect(validateProxyEndpointForTest({ host: "a.com", port: 80 })).toEqual({
      host: "a.com",
      port: 80,
    });
    expect(() =>
      validateProxyEndpointForTest({ host: "", port: 80 }),
    ).toThrow("请输入服务器地址");
  });
});

describe("toElectronProxyConfig", () => {
  it("uses direct mode when disabled", () => {
    expect(
      toElectronProxyConfig({
        enabled: false,
        host: "proxy.example",
        port: 8080,
      }),
    ).toEqual({ mode: "direct" });
  });

  it("builds fixed_servers with loopback bypass when enabled", () => {
    expect(
      toElectronProxyConfig({
        enabled: true,
        host: "127.0.0.2",
        port: 8888,
      }),
    ).toEqual({
      mode: "fixed_servers",
      proxyRules: "http://127.0.0.2:8888",
      proxyBypassRules: PROXY_BYPASS_RULES,
    });
    expect(PROXY_BYPASS_RULES).toContain("<local>");
    expect(PROXY_BYPASS_RULES).toContain("127.0.0.1");
    expect(PROXY_BYPASS_RULES).toContain("localhost");
    expect(PROXY_BYPASS_RULES).toContain("[::1]");
    expect(PROXY_BYPASS_RULES).not.toContain("<-loopback>");
  });

  it("falls back to direct when enabled but incomplete", () => {
    expect(
      toElectronProxyConfig({ enabled: true, host: "", port: 8080 }),
    ).toEqual({ mode: "direct" });
  });
});
