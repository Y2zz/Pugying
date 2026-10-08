import {
  articleSettingsForPlatform,
  hasCustomizedArticleSettings,
  type ArticleAccountSettings,
} from "@shared/article-settings";
import {
  normalizeBoundPlatformResourceRef,
  normalizePlatformResourceRefs,
  topicNames,
  topicRefsFromNames,
} from "@shared/platform-resource";
import type {
  ContentTargetOverrides,
  ContentVisibility,
  CoverKind,
  PlatformAccountItem,
  PlatformId,
} from "@/lib/api";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import {
  countArticleAccountTitleCharacters,
  normalizeArticleTitle,
} from "./article-title";
import {
  articleCoverAspects,
  getArticlePlatformFields,
  isArticleCoverRequired,
  validateArticleSchedule,
} from "./article-platform-fields";
import {
  extractLocalImagePathsFromHtml,
  htmlToPlainText,
} from "./ArticleRichTextEditor";

export { extractLocalImagePathsFromHtml, htmlToPlainText };

export const VISIBILITY_OPTIONS: { value: ContentVisibility; label: string }[] =
  [
    { value: "public", label: "公开" },
    { value: "friends", label: "好友可见" },
    { value: "private", label: "仅自己可见" },
  ];

export const ACCOUNT_STATUS_TEXT: Record<
  PlatformAccountItem["status"],
  string
> = {
  active: "正常",
  expired: "需重新授权",
  revoked: "需重新授权",
};

export const COVER_ASPECT_LABEL: Record<CoverKind, string> = {
  portrait: "竖版 3:4",
  landscape: "横版 4:3",
};

export const COVER_ASPECT_RATIO: Record<CoverKind, number> = {
  portrait: 3 / 4,
  landscape: 4 / 3,
};

export const COVER_ASPECTS: CoverKind[] = ["portrait", "landscape"];

/**
 * 单个封面槽的会话态。
 * - blob：待上传的裁切结果；账号级封面从服务端载入后也转成 blob，
 *   因为保存时服务端会整体重建 Target 行，账号封面必须每次重新上传。
 * - saved：仅通用封面使用，表示服务端已有、本次未改。
 */
export interface CoverSlot {
  blob: Blob | null;
  previewUrl: string;
  sourceUrl: string;
  saved: boolean;
}

export type CoverPair = Record<CoverKind, CoverSlot>;

export function emptyCoverSlot(): CoverSlot {
  return { blob: null, previewUrl: "", sourceUrl: "", saved: false };
}

export function emptyCoverPair(): CoverPair {
  return { portrait: emptyCoverSlot(), landscape: emptyCoverSlot() };
}

export function coverSlotReady(slot: CoverSlot): boolean {
  return Boolean(slot.blob || slot.saved || slot.previewUrl);
}

/** 账号级草稿：正文全账号共用，不在此列 */
export interface ArticleOverrideDraft {
  title: string;
  covers: CoverPair;
  extraCovers?: CoverSlot[];
  tagsText: string;
  /** 抖音等平台话题资源；有值时优先于 tagsText */
  topicRefs: import("@shared/platform-resource").PlatformResourceRef[];
  /** B 站文章文集（最多一条）；选择器用数组承载 */
  anthologyRefs: import("@shared/platform-resource").PlatformResourceRef[];
  scheduledLocal: string;
  visibility: ContentVisibility;
  location: string;
  partition: string;
  articleSettings?: ArticleAccountSettings;
  allowDownload?: boolean;
  authorDeclaration?: import("@shared/douyin-graphic-settings").DouyinAuthorDeclaration;
}

export function emptyArticleDraft(): ArticleOverrideDraft {
  return {
    title: "",
    covers: emptyCoverPair(),
    extraCovers: [emptyCoverSlot(), emptyCoverSlot()],
    tagsText: "",
    topicRefs: [],
    anthologyRefs: [],
    scheduledLocal: "",
    visibility: "public",
    location: "",
    partition: "",
  };
}

export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(value: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,，#]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

/** 服务端 Target overrides + 内容级默认 → 账号草稿（封面另行载入） */
export function draftFromTarget(
  overrides: ContentTargetOverrides | undefined,
  content: {
    tags: string[];
    visibility: ContentVisibility;
    scheduledAt: string | null;
    location?: string | null;
  },
): ArticleOverrideDraft {
  const tags = overrides?.tags ?? content.tags;
  const topicRefs = normalizePlatformResourceRefs(overrides?.topicRefs);
  const resolvedTopics =
    topicRefs.length > 0 ? topicRefs : topicRefsFromNames(tags);
  const anthology = normalizeBoundPlatformResourceRef(overrides?.anthologyRef);
  return {
    ...emptyArticleDraft(),
    title: overrides?.title ?? "",
    tagsText: (topicRefs.length > 0 ? topicNames(topicRefs) : tags).join(" "),
    topicRefs: resolvedTopics,
    anthologyRefs: anthology ? [anthology] : [],
    scheduledLocal: isoToLocalInput(
      overrides?.scheduledAt ?? content.scheduledAt,
    ),
    visibility: overrides?.visibility ?? content.visibility,
    location: (overrides?.location ?? content.location ?? "").trim(),
    partition: overrides?.partition ?? "",
    allowDownload: overrides?.allowDownload ?? true,
    authorDeclaration: overrides?.authorDeclaration ?? "none",
    articleSettings: overrides?.articleSettings,
  };
}

/** 账号草稿 → Target overrides；平台不支持的字段不下发 */
export function articleDraftToOverrides(
  draft: ArticleOverrideDraft,
  platform: PlatformId,
): ContentTargetOverrides {
  const spec = getArticlePlatformFields(platform);
  const result: ContentTargetOverrides = {
    articleSettings: articleSettingsForPlatform(
      draft.articleSettings,
      platform,
    ),
  };
  const title = normalizeArticleTitle(draft.title);
  if (title) {
    result.title = title;
  }
  const topicRefs = normalizePlatformResourceRefs(draft.topicRefs);
  if (spec.tags.enabled && topicRefs.length > 0) {
    result.topicRefs = topicRefs;
    result.tags = topicNames(topicRefs);
  } else {
    const tags = parseTags(draft.tagsText);
    if (spec.tags.enabled && tags.length > 0) {
      result.tags = tags;
    }
  }
  if (platform === "bilibili") {
    const anthologyRef = normalizeBoundPlatformResourceRef(draft.anthologyRefs[0]);
    if (anthologyRef) {
      result.anthologyRef = anthologyRef;
    }
    // 专栏话题须为已绑定资源；id=0 的纯文本话题不下发
    if (result.topicRefs) {
      const bound = result.topicRefs.filter((ref) => ref.id !== "0");
      if (bound.length > 0) {
        result.topicRefs = bound.slice(0, 1);
        result.tags = topicNames(result.topicRefs);
      } else {
        delete result.topicRefs;
        delete result.tags;
      }
    }
  }
  const iso = localInputToIso(draft.scheduledLocal);
  if (spec.schedule?.enabled && iso) {
    result.scheduledAt = iso;
  }
  if (spec.visibility) {
    result.visibility = spec.visibility.includes(draft.visibility)
      ? draft.visibility
      : spec.visibility[0];
  }
  if (spec.location.enabled && draft.location.trim()) {
    result.location = draft.location.trim();
  }
  if (spec.partition.enabled && draft.partition.trim()) {
    result.partition = draft.partition.trim();
  }
  return result;
}

export function articleDraftHasCustomizations(
  draft: ArticleOverrideDraft,
): boolean {
  return (
    hasCustomizedArticleSettings(draft.articleSettings) ||
    Boolean(draft.title.trim()) ||
    COVER_ASPECTS.some((aspect) => coverSlotReady(draft.covers[aspect])) ||
    Boolean(draft.extraCovers?.some(coverSlotReady)) ||
    Boolean(draft.tagsText.trim()) ||
    draft.topicRefs.length > 0 ||
    draft.anthologyRefs.length > 0 ||
    Boolean(draft.scheduledLocal.trim()) ||
    draft.visibility !== "public" ||
    draft.allowDownload === false ||
    Boolean(draft.authorDeclaration && draft.authorDeclaration !== "none") ||
    Boolean(draft.location.trim()) ||
    Boolean(draft.partition.trim())
  );
}

/** 阻止保存的账号级问题（超长、超量、定时越界） */
export function getArticleAccountDraftIssues(
  draft: ArticleOverrideDraft,
  platform: PlatformId,
  commonTitle: string,
): string[] {
  const spec = getArticlePlatformFields(platform);
  const issues: string[] = [];

  const titleLength = countArticleAccountTitleCharacters(
    draft.title.trim() || commonTitle,
  );
  if (platform === "toutiao" && titleLength === 1) {
    issues.push("标题至少 2 字");
  }
  if (
    countArticleAccountTitleCharacters(draft.title.trim() || commonTitle) >
    spec.titleMax
  ) {
    issues.push("标题超长");
  }
  if (
    platform === "douyin" &&
    Array.from(draft.articleSettings?.summary ?? "").length > 30
  ) {
    issues.push("摘要最多 30 字");
  }
  if (
    spec.tags.enabled &&
    Math.max(parseTags(draft.tagsText).length, draft.topicRefs.length) >
      spec.tags.maxCount
  ) {
    issues.push("话题过多");
  }
  if (spec.schedule?.enabled && draft.scheduledLocal.trim()) {
    const iso = localInputToIso(draft.scheduledLocal);
    if (!iso || validateArticleSchedule(iso, spec.schedule)) {
      issues.push("发布时间不可用");
    }
  }
  return issues;
}

/** 账号实际使用的封面：优先账号单独设置，否则回落通用封面 */
export function effectiveCover(
  draft: ArticleOverrideDraft,
  common: CoverPair,
  aspect: CoverKind,
): { slot: CoverSlot; own: boolean } {
  const own = draft.covers[aspect];
  if (coverSlotReady(own)) {
    return { slot: own, own: true };
  }
  return { slot: common[aspect], own: false };
}

/** 该账号平台必需、但当前无可用封面的比例 */
export function missingRequiredCovers(
  draft: ArticleOverrideDraft,
  common: CoverPair,
  platform: PlatformId,
): CoverKind[] {
  if (platform === "bilibili") {
    return draft.articleSettings?.customCover &&
      !coverSlotReady(effectiveCover(draft, common, "landscape").slot)
      ? ["landscape"]
      : [];
  }
  if (platform === "toutiao") {
    const mode = draft.articleSettings?.coverMode ?? "single";
    if (mode === "none") {
      return [];
    }
    if (
      mode === "triple" &&
      [0, 1].some(
        (index) =>
          !coverSlotReady(draft.extraCovers?.[index] ?? emptyCoverSlot()),
      )
    ) {
      return ["landscape"];
    }
  }
  return articleCoverAspects(platform).filter(
    (aspect) =>
      isArticleCoverRequired(platform, aspect) &&
      !coverSlotReady(effectiveCover(draft, common, aspect).slot),
  );
}

export function describeSchedule(scheduledLocal: string): string {
  if (!scheduledLocal.trim()) {
    return "立即发布";
  }
  const date = new Date(scheduledLocal);
  if (Number.isNaN(date.getTime())) {
    return "定时待完善";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function describeVisibility(
  draft: ArticleOverrideDraft,
  platform: PlatformId,
): string | null {
  const spec = getArticlePlatformFields(platform);
  if (!spec.visibility) {
    return null;
  }
  const value = spec.visibility.includes(draft.visibility)
    ? draft.visibility
    : spec.visibility[0];
  return VISIBILITY_OPTIONS.find((opt) => opt.value === value)?.label ?? "公开";
}

export function articleBodyPlainLength(html: string): number {
  return htmlToPlainText(html).length;
}

export function localPathToFileUrl(absPath: string): string {
  const trimmed = absPath.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("file:")) {
    return trimmed;
  }
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return `file:///${trimmed.replace(/\\/g, "/")}`;
  }
  return `file://${trimmed}`;
}

export function looksUnstableLocalPath(absPath: string): boolean {
  const p = absPath.toLowerCase();
  return (
    p.includes("/volumes/") ||
    p.includes("\\volumes\\") ||
    p.includes("icloud") ||
    p.includes("mobile documents") ||
    p.includes("com~apple~clouddocs") ||
    p.includes("onedrive") ||
    p.includes("baidu") ||
    p.includes("百度网盘")
  );
}

async function checkLocalPathReadable(absPath: string): Promise<boolean> {
  const trimmed = absPath.trim();
  if (!trimmed) {
    return false;
  }
  const bridge = getPugyingDesktopBridge();
  if (!bridge?.checkLocalPathReadable) {
    return true;
  }
  try {
    return await bridge.checkLocalPathReadable(trimmed);
  } catch {
    return false;
  }
}

export async function checkLocalPathsReadable(
  paths: string[],
): Promise<boolean> {
  for (const p of paths) {
    if (!(await checkLocalPathReadable(p))) {
      return false;
    }
  }
  return true;
}
