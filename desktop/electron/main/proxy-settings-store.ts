import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  parseProxySettings,
  validateProxySettingsForSave,
  type ProxySettings,
} from "../../shared/proxy-settings";

export function readProxySettings(path: string): ProxySettings {
  try {
    return parseProxySettings(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return parseProxySettings(null);
  }
}

export async function saveProxySettings(
  path: string,
  input: unknown,
): Promise<ProxySettings> {
  const settings = validateProxySettingsForSave(input);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(settings), "utf8");
  await rename(`${path}.tmp`, path);
  return settings;
}
