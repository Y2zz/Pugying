import type { BusyPhase, PublishFlowStepId } from '../publish-video/helpers';

export {
  TITLE_MAX,
  BODY_MAX,
  MAX_COVER_UPLOAD_BYTES,
  emptyDraft,
  draftFromTargetAndContent,
  draftToOverrides,
  validateSchedule,
  summarizeSelectedAccountIssues,
  localPathToFileUrl,
  checkLocalPathsReadable,
  LOCAL_PATH_MISSING_IMAGE,
  looksUnstableLocalPath,
  type OverrideDraft,
  type CoverKind,
  type BusyPhase,
  type PublishFlowStepId,
} from '../publish-video/helpers';

import {
  extractLocalImagePathsFromHtml,
  htmlToPlainText,
} from './ArticleRichTextEditor';

export { extractLocalImagePathsFromHtml, htmlToPlainText };

/** 图文正文纯文字：最少 200，最多 5 万 */
export const ARTICLE_BODY_MIN = 200;
export const ARTICLE_BODY_MAX = 50_000;

export function articleBodyPlainLength(html: string): number {
  return htmlToPlainText(html).length;
}

/** 图文进入即编辑；仅发布中切到进度态 */
export function deriveArticlePublishFlowStep(input: {
  loading: boolean;
  busyPhase: BusyPhase;
  publishHint: string;
}): PublishFlowStepId {
  const { loading, busyPhase, publishHint } = input;

  if (busyPhase === 'publishing') {
    const hint = publishHint.trim();
    if (hint.includes('开始推送') || (hint.includes(' · ') && !hint.includes('申请'))) {
      return 'progress';
    }
    return 'publish';
  }

  if (loading) {
    return 'upload';
  }

  return 'configure';
}

export function describeArticlePublishFlowStep(step: PublishFlowStepId): string {
  switch (step) {
    case 'upload':
      return '正在加载草稿…';
    case 'configure':
      return '填写标题、正文与封面，并配置分发账号';
    case 'publish':
      return '正在提交发布任务';
    case 'progress':
      return '正在发布';
    default:
      return '填写标题、正文与封面，并配置分发账号';
  }
}
