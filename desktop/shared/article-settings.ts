/** 文章账号独有设置；资源类字段通过独立素材/平台选择器处理。 */
export interface ArticleAccountSettings {
  summary?: string;
  coverMode?: "single" | "triple" | "none";
  customCover?: boolean;
  comments?: "open" | "closed" | "selected";
  original?: boolean;
  advertisement?: boolean;
  exclusive?: boolean;
  allowReward?: boolean;
  syncToMicroPost?: boolean;
  declarations?: ToutiaoArticleDeclaration[];
}

export const TOUTIAO_ARTICLE_DECLARATIONS = [
  "internet",
  "platform",
  "opinion",
  "ai",
  "fiction",
  "investment",
  "health",
] as const;
export type ToutiaoArticleDeclaration =
  (typeof TOUTIAO_ARTICLE_DECLARATIONS)[number];

/** 防止其他平台字段随账号切换或批量编辑混入。 */
export function articleSettingsForPlatform(
  settings: ArticleAccountSettings | undefined,
  platform: string,
): ArticleAccountSettings {
  if (platform === "douyin") {
    return { summary: settings?.summary?.trim() || "" };
  }
  if (platform === "bilibili") {
    return {
      comments: settings?.comments ?? "open",
      original: settings?.original ?? false,
      customCover: settings?.customCover ?? false,
    };
  }
  if (platform === "toutiao") {
    return {
      coverMode: settings?.coverMode ?? "single",
      advertisement: settings?.advertisement ?? false,
      exclusive: settings?.exclusive ?? false,
      allowReward: settings?.allowReward ?? true,
      syncToMicroPost: settings?.syncToMicroPost ?? true,
      declarations: [...new Set(settings?.declarations ?? [])].filter((value) =>
        (TOUTIAO_ARTICLE_DECLARATIONS as readonly string[]).includes(value),
      ),
    };
  }
  return {};
}

/** 与安全默认值不同的设置才视为账号自定义。 */
export function hasCustomizedArticleSettings(
  settings: ArticleAccountSettings | undefined,
): boolean {
  return Boolean(
    settings &&
    ((settings.coverMode && settings.coverMode !== "single") ||
      settings.customCover ||
      settings.summary?.trim() ||
      (settings.comments && settings.comments !== "open") ||
      settings.original ||
      settings.advertisement ||
      settings.exclusive ||
      settings.allowReward === false ||
      settings.syncToMicroPost === false ||
      settings.declarations?.length),
  );
}
