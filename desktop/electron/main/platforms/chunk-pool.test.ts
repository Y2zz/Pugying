import {
  clampUploadConcurrency,
  DEFAULT_UPLOAD_CONCURRENCY,
  mapPool,
} from "./chunk-pool";

it("mapPool runs at most concurrency workers and preserves index order", async () => {
  let inflight = 0;
  let peak = 0;
  const started: number[] = [];
  const results = await mapPool(6, 2, async (index) => {
    started.push(index);
    inflight += 1;
    peak = Math.max(peak, inflight);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    inflight -= 1;
    return index * 10;
  });
  expect(peak).toBeLessThanOrEqual(2);
  expect(results).toEqual([0, 10, 20, 30, 40, 50]);
  expect(started).toHaveLength(6);
});

it("clampUploadConcurrency falls back and caps at max", () => {
  expect(DEFAULT_UPLOAD_CONCURRENCY).toBe(3);
  expect(clampUploadConcurrency(undefined, DEFAULT_UPLOAD_CONCURRENCY)).toBe(
    3,
  );
  expect(clampUploadConcurrency(0, DEFAULT_UPLOAD_CONCURRENCY)).toBe(3);
  expect(clampUploadConcurrency(2.9, DEFAULT_UPLOAD_CONCURRENCY)).toBe(2);
  expect(clampUploadConcurrency(99, DEFAULT_UPLOAD_CONCURRENCY, 8)).toBe(8);
});
