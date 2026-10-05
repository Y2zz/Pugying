/** 临时平台能力，不写入文章草稿或账号数据库。 */
export interface ToutiaoRewardPrivilege {
  label: string;
  remainingToday: number | null;
  available: boolean;
  checkedAt: string;
}

export function parseToutiaoRewardPrivilege(
  label: string,
  disabled: boolean,
): ToutiaoRewardPrivilege | null {
  const text = label.replace(/\s+/g, ' ').trim();
  if (!text.startsWith('允许赞赏')) {
    return null;
  }
  const match = text.match(/今日\s*(?:还)?有\s*(\d+)\s*次机会/);
  const remainingToday = match ? Number(match[1]) : null;
  return {
    label: text,
    remainingToday,
    available: !disabled && (remainingToday === null || remainingToday > 0),
    checkedAt: new Date().toISOString(),
  };
}
