/**
 * 用 Node/V8 的 JSON.parse context.source 保留超大整数原串，
 * 避免作品 ID 等被 Number 舍入。TS lib 仍只声明双参 reviver，故本地断言。
 */

type JsonReviverContext = { source?: string };

function reviver(
  _key: string,
  value: unknown,
  context?: JsonReviverContext,
): unknown {
  if (
    typeof value === "number" &&
    !Number.isSafeInteger(value) &&
    typeof context?.source === "string"
  ) {
    return context.source;
  }
  return value;
}

const typedReviver = reviver as (
  this: unknown,
  key: string,
  value: unknown,
) => unknown;

export function parseJsonPreservingIds(body: Uint8Array): Record<string, unknown> {
  try {
    const text = Buffer.from(body).toString("utf8");
    const parsed: unknown = JSON.parse(text, typedReviver);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
