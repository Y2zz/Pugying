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
  const text = label.replace(/\s+/g, " ").trim();
  if (!text.startsWith("允许赞赏")) {
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

/**
 * 从创作者文章发布页 HTML 内嵌的 `creator_project_info` 解析赞赏额度。
 * 官方页 bootstrap 含 `praise_count_remained`，无需再跑整页 JS。
 */
export function parseToutiaoRewardFromPublishHtml(
  html: string,
): ToutiaoRewardPrivilege | null {
  const block = html.match(/"creator_project_info"\s*:\s*\{([^}]*)\}/);
  if (!block) {
    return null;
  }
  const body = block[1];
  const remainingMatch = body.match(/"praise_count_remained"\s*:\s*(-?\d+)/);
  if (!remainingMatch) {
    return null;
  }
  const remainingToday = Number(remainingMatch[1]);
  if (!Number.isFinite(remainingToday) || remainingToday < 0) {
    return null;
  }
  const banned = /"creator_project_banned_flag"\s*:\s*true/.test(body);
  return parseToutiaoRewardPrivilege(
    `允许赞赏（今日还有${remainingToday}次机会）`,
    banned,
  );
}
