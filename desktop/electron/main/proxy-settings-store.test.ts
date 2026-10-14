import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readProxySettings, saveProxySettings } from "./proxy-settings-store";

it("defaults, persists, and rejects invalid enabled config", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pugying-proxy-"));
  const path = join(directory, "proxy-settings.json");
  try {
    expect(readProxySettings(path)).toEqual({
      enabled: false,
      host: "",
      port: null,
    });
    const saved = await saveProxySettings(path, {
      enabled: true,
      host: "proxy.example",
      port: 7890,
    });
    expect(saved).toEqual({
      enabled: true,
      host: "proxy.example",
      port: 7890,
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(saved);
    expect(readProxySettings(path)).toEqual(saved);

    await writeFile(path, "broken");
    expect(readProxySettings(path).enabled).toBe(false);

    await expect(
      saveProxySettings(path, {
        enabled: true,
        host: "",
        port: 7890,
      }),
    ).rejects.toThrow("请输入服务器地址");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
