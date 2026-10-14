import type { PlatformAccountItem } from "@/lib/api";
import { PLATFORM_NAMES } from "@/lib/content-management";

/** 名称在列表中重复的账号名（不区分大小写、去首尾空格） */
export function duplicateAccountNames(
  accounts: Array<Pick<PlatformAccountItem, "displayName">>,
): Set<string> {
  const seen = new Map<string, number>();
  for (const account of accounts) {
    const key = account.displayName.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set(
    [...seen].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

/** 是否需要补平台名区分 */
export function isDuplicateAccountName(
  account: Pick<PlatformAccountItem, "displayName">,
  duplicates: Set<string>,
): boolean {
  return duplicates.has(account.displayName.trim().toLowerCase());
}

/** 重名账号补上平台名，如「Alice（抖音）」，其余原样返回 */
export function accountLabel(
  account: Pick<PlatformAccountItem, "displayName" | "platform">,
  duplicates: Set<string>,
): string {
  return isDuplicateAccountName(account, duplicates)
    ? `${account.displayName}（${PLATFORM_NAMES[account.platform] ?? account.platform}）`
    : account.displayName;
}
