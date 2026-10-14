import { formatRelativeTime, formatTimeUntil } from "./relative-time";

const NOW = Date.parse("2026-10-13T08:00:00+08:00");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

it("formats past times in one style without 大约", () => {
  expect(formatRelativeTime(ago(20 * 1000), NOW)).toBe("刚刚");
  expect(formatRelativeTime(ago(5 * 60 * 1000), NOW)).toBe("5 分钟前");
  expect(formatRelativeTime(ago(23.9 * 3600 * 1000), NOW)).toBe("23 小时前");
  expect(formatRelativeTime(ago(25 * 3600 * 1000), NOW)).toBe("1 天前");
  expect(formatRelativeTime(ago(40 * 86400 * 1000), NOW)).toBe("2026/09/03");
  expect(formatRelativeTime(null, NOW)).toBe("—");
});

it("formats time until a future moment", () => {
  expect(formatTimeUntil(NOW + 30 * 60 * 1000, NOW)).toBe("30 分钟后");
  expect(formatTimeUntil(NOW + 5 * 3600 * 1000, NOW)).toBe("5 小时后");
  expect(formatTimeUntil(NOW + 1.2 * 86400 * 1000, NOW)).toBe("2 天后");
  expect(formatTimeUntil(NOW - 1, NOW)).toBe("已到期");
});
