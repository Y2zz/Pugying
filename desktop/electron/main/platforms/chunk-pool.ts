/**
 * 有界并发执行分片任务：最多同时跑 `concurrency` 个，完成一个再取下一个。
 */

/**
 * 各平台分片上传统一默认并发；上限见 clamp。
 */
export const DEFAULT_UPLOAD_CONCURRENCY = 3;

export async function mapPool<T>(
  count: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  const limit = Math.max(1, Math.min(Math.floor(concurrency), count || 1));
  const results = new Array<T>(count);
  let next = 0;
  async function run(): Promise<void> {
    while (next < count) {
      const index = next;
      next += 1;
      results[index] = await worker(index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, count) }, () => run()),
  );
  return results;
}

/**
 * 规范化并发度：非法/缺失时用 defaultValue；上限避免打爆链路（B 站部分线路约 8）。
 */
export function clampUploadConcurrency(
  value: unknown,
  defaultValue: number,
  max = 8,
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    return defaultValue;
  }
  return Math.min(max, Math.max(1, Math.floor(n)));
}
