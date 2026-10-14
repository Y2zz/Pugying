const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 全应用统一的相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前，不带「大约」。
 * 超过 30 天显示日期（如 2026/09/01）；未来时间按「刚刚」处理。
 */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return "—";
  }
  const diff = now - time;
  if (diff < MINUTE) {
    return "刚刚";
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)} 分钟前`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} 小时前`;
  }
  if (diff < 30 * DAY) {
    return `${Math.floor(diff / DAY)} 天前`;
  }
  const date = new Date(time);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

/** 距未来某时刻还有多久：N 分钟后 / N 小时后 / N 天后（向上取整，已过返回「已到期」） */
export function formatTimeUntil(
  value: string | number | Date,
  now: number = Date.now(),
): string {
  const diff = new Date(value).getTime() - now;
  if (diff <= 0) {
    return "已到期";
  }
  if (diff < HOUR) {
    return `${Math.max(1, Math.ceil(diff / MINUTE))} 分钟后`;
  }
  if (diff < DAY) {
    return `${Math.ceil(diff / HOUR)} 小时后`;
  }
  return `${Math.ceil(diff / DAY)} 天后`;
}
