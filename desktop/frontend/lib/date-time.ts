const MINUTE_MS = 60_000;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface DateTimeLimits {
  min?: string;
  max?: string;
  /** 从当前时刻算起的最短提前量和最远天数。 */
  minHours?: number;
  maxDays?: number;
}
export interface DateTimeWindow {
  min?: Date;
  max?: Date;
}

export function padTimePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function parseLocalDateTime(value: string): Date | undefined {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute)
  ) {
    return undefined;
  }
  return date;
}

export function formatLocalDateTime(date: Date): string {
  return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}T${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`;
}

/** 按分钟精度收紧边界，避免“2 小时后”被截断到不足 2 小时。 */
export function getDateTimeWindow(
  limits: DateTimeLimits,
  now: number,
): DateTimeWindow {
  const minimums: number[] = [];
  const maximums: number[] = [];
  const min = parseLocalDateTime(limits.min ?? '');
  const max = parseLocalDateTime(limits.max ?? '');
  if (min) {
    minimums.push(min.getTime());
  }
  if (max) {
    maximums.push(max.getTime());
  }
  if (limits.minHours !== undefined) {
    minimums.push(now + limits.minHours * 60 * MINUTE_MS);
  }
  if (limits.maxDays !== undefined) {
    maximums.push(now + limits.maxDays * 24 * 60 * MINUTE_MS);
  }
  return {
    min: minimums.length
      ? new Date(Math.ceil(Math.max(...minimums) / MINUTE_MS) * MINUTE_MS)
      : undefined,
    max: maximums.length
      ? new Date(Math.floor(Math.min(...maximums) / MINUTE_MS) * MINUTE_MS)
      : undefined,
  };
}

/** 获取某一天真正可选的分钟区间；整天不可选时返回 undefined。 */
export function getDayTimeRange(
  date: Date,
  window: DateTimeWindow,
): { min: number; max: number } | undefined {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
  );
  const minimum = new Date(
    Math.max(start.getTime(), window.min?.getTime() ?? -Infinity),
  );
  const maximum = new Date(
    Math.min(end.getTime(), window.max?.getTime() ?? Infinity),
  );
  if (minimum > maximum) {
    return undefined;
  }
  return {
    min: minimum.getHours() * 60 + minimum.getMinutes(),
    max: maximum.getHours() * 60 + maximum.getMinutes(),
  };
}

export function isDateTimeAllowed(date: Date, window: DateTimeWindow): boolean {
  return (
    Number.isFinite(date.getTime()) &&
    (!window.min || date >= window.min) &&
    (!window.max || date <= window.max)
  );
}

export function clampDateTime(
  date: Date,
  window: DateTimeWindow,
): Date | undefined {
  if (window.min && window.max && window.min > window.max) {
    return undefined;
  }
  return new Date(
    Math.min(
      window.max?.getTime() ?? Infinity,
      Math.max(window.min?.getTime() ?? -Infinity, date.getTime()),
    ),
  );
}
