import type { ContentTargetOverrides, CoverKind, PlatformId } from '@/lib/api';
import {
  countArticleAccountTitleCharacters,
  normalizeArticleTitle,
} from '../publish-article/article-title';
import {
  composeDouyinGraphicDescription,
  isDouyinAuthorDeclaration,
} from '@shared/douyin-graphic-settings';
import {
  effectiveCover,
  coverSlotReady,
  emptyArticleDraft,
  localInputToIso,
  parseTags,
  type ArticleOverrideDraft,
  type CoverPair,
} from '../publish-article/helpers';
import {
  getGraphicPlatformFields,
  graphicCoverAspects,
  isGraphicCoverRequired,
  validateGraphicSchedule,
} from './graphic-platform-fields';

/** 按实际保存的文案计数，保留段落和连续空白。 */
export function graphicBodyPlainLength(text: string): number {
  return text.trim().length;
}

/**
 * 图文账号草稿问题（用图文平台规格，不用文章规格）。
 * 复用文章草稿结构，仅校验规则不同。
 */
export function getGraphicAccountDraftIssues(
  draft: ArticleOverrideDraft,
  platform: PlatformId,
  commonBody = '',
  commonTitle = '',
): string[] {
  const spec = getGraphicPlatformFields(platform);
  const issues: string[] = [];

  if (countArticleAccountTitleCharacters(draft.title) > spec.titleMax) {
    issues.push('标题超长');
  }
  if (
    spec.tags.enabled &&
    parseTags(draft.tagsText).length > spec.tags.maxCount
  ) {
    issues.push('话题过多');
  }
  if (!spec.tags.enabled && parseTags(draft.tagsText).length > 0) {
    issues.push('话题需移入文案');
  }
  if (
    platform === 'toutiao' &&
    [draft.title.trim() || commonTitle.trim(), commonBody.trim()]
      .filter(Boolean)
      .join('\n\n').length > 2000
  ) {
    issues.push('标题与文案合计超长');
  }
  if (
    platform === 'xiaohongshu' &&
    draft.authorDeclaration === 'personal_opinion'
  ) {
    issues.push('自主声明不可用');
  }
  if (platform === 'toutiao' && draft.authorDeclaration === 'marketing') {
    issues.push('自主声明不可用');
  }
  if (platform === 'channels') {
    const title = draft.title.trim() || commonTitle.trim();
    const tags = parseTags(draft.tagsText);
    const parts = [title, commonBody.trim()].filter(Boolean).join('\n');
    const topicSuffix = tags.map((tag) => `#${tag}`).join(' ');
    const description = [parts, topicSuffix]
      .filter(Boolean)
      .join(parts && topicSuffix ? ' ' : '');
    if (description.length > spec.bodyPlainMax) {
      issues.push('标题、文案与话题合计超长');
    }
  }
  if (platform === 'douyin') {
    if (
      composeDouyinGraphicDescription(commonBody, parseTags(draft.tagsText))
        .length > spec.bodyPlainMax
    ) {
      issues.push('作品描述与话题合计超长');
    }
    if (
      draft.authorDeclaration !== undefined &&
      !isDouyinAuthorDeclaration(draft.authorDeclaration)
    ) {
      issues.push('自主声明不可用');
    }
  }
  if (spec.schedule?.enabled && draft.scheduledLocal.trim()) {
    const iso = localInputToIso(draft.scheduledLocal);
    if (!iso || validateGraphicSchedule(iso, spec.schedule)) {
      issues.push('发布时间不可用');
    }
  }
  return issues;
}

/** 该账号平台必需、但当前无可用封面的比例（图文规格） */
export function missingRequiredGraphicCovers(
  draft: ArticleOverrideDraft,
  common: CoverPair,
  platform: PlatformId,
): CoverKind[] {
  return graphicCoverAspects(platform).filter(
    (aspect) =>
      isGraphicCoverRequired(platform, aspect) &&
      !coverSlotReady(effectiveCover(draft, common, aspect).slot),
  );
}

/** 账号草稿 → Target overrides（图文平台规格） */
export function graphicDraftToOverrides(
  draft: ArticleOverrideDraft,
  platform: PlatformId,
): ContentTargetOverrides {
  const spec = getGraphicPlatformFields(platform);
  const result: ContentTargetOverrides = {};
  if (draft.title.trim()) {
    result.title = normalizeArticleTitle(draft.title);
  }
  const tags = parseTags(draft.tagsText);
  if (spec.tags.enabled && tags.length > 0) {
    result.tags = tags;
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
  if (platform === 'xiaohongshu' || platform === 'toutiao') {
    result.authorDeclaration = draft.authorDeclaration ?? 'none';
  }
  if (platform === 'douyin') {
    result.allowDownload = draft.allowDownload ?? true;
    result.authorDeclaration = draft.authorDeclaration ?? 'none';
  }
  return result;
}

/** 图文账号空草稿；视频号默认仅自己可见，便于试发。 */
export function emptyGraphicAccountDraft(
  platform?: PlatformId,
): ArticleOverrideDraft {
  const draft = emptyArticleDraft();
  if (platform === 'channels') {
    draft.visibility = 'private';
  }
  return draft;
}

export type { ArticleOverrideDraft, CoverPair };
