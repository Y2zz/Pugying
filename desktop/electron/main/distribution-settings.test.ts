import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readDistributionConcurrency,
  saveDistributionConcurrency,
} from "./distribution-settings";

it("defaults to three and persists a user selected number", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pugying-settings-"));
  const path = join(directory, "distribution.json");
  try {
    expect(readDistributionConcurrency(path)).toBe(3);
    await saveDistributionConcurrency(path, 7);
    expect(readDistributionConcurrency(path)).toBe(7);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      concurrency: 7,
    });
    for (const contents of [
      "broken",
      '{"concurrency":0}',
      '{"concurrency":1.5}',
    ]) {
      await writeFile(path, contents);
      expect(readDistributionConcurrency(path)).toBe(3);
    }
    await expect(saveDistributionConcurrency(path, -1)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
