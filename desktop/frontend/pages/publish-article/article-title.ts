/** 共用文章标题上限，与账号所属平台的标题上限独立。 */
export const ARTICLE_TITLE_MAX = 60;

/** 去掉首尾空白，将连续空白整理成一个空格；不改写符号或表情。 */
export function normalizeArticleTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

/** 空白不计入标题字数，保留输入中的空格。 */
export function countArticleTitleCharacters(title: string): number {
  return Array.from(title.replace(/\s/g, "")).length;
}

/**
 * 账号侧以实际保存的标题计数，单个分隔空格也计入长度。
 * 暂按 Unicode 码点计数；平台对组合表情的算法须在实际编辑器中核实。
 */
export function countArticleAccountTitleCharacters(title: string): number {
  return Array.from(normalizeArticleTitle(title)).length;
}
