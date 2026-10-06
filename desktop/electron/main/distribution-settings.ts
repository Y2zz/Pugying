import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DEFAULT_DISTRIBUTION_CONCURRENCY,
  isDistributionConcurrency,
} from "../../shared/distribution";

export function readDistributionConcurrency(path: string): number {
  try {
    const settings = JSON.parse(readFileSync(path, "utf8")) as {
      concurrency?: unknown;
    };
    return isDistributionConcurrency(settings.concurrency)
      ? settings.concurrency
      : DEFAULT_DISTRIBUTION_CONCURRENCY;
  } catch {
    return DEFAULT_DISTRIBUTION_CONCURRENCY;
  }
}

export async function saveDistributionConcurrency(
  path: string,
  concurrency: number,
): Promise<void> {
  if (!isDistributionConcurrency(concurrency)) {
    throw new Error("请输入大于零的整数");
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify({ concurrency }), "utf8");
  await rename(`${path}.tmp`, path);
}
