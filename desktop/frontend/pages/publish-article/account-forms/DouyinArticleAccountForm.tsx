import { getArticlePlatformFields } from '../article-platform-fields';
import {
  ArticleAccountFormLayout,
  ArticleCoverOverrideField,
  ArticleScheduleField,
  ArticleTagsField,
  ArticleTitleOverrideField,
  ArticleVisibilityField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from './shared-fields';

const spec = getArticlePlatformFields('douyin');

/** 抖音发文章：标题 / 横版封面可覆盖；话题、谁可以看、定时 */
export function DouyinArticleAccountForm({
  account,
  draft,
  commonTitle,
  commonCovers,
  disabled,
  onDraftChange,
  onEditCover,
}: ArticlePlatformAccountFormProps) {
  const patch = draftPatcher(draft, onDraftChange);

  return (
    <ArticleAccountFormLayout
      content={
        <>
          <ArticleTitleOverrideField
            accountId={account.id}
            value={draft.title}
            commonTitle={commonTitle}
            max={spec.titleMax}
            disabled={disabled}
            onChange={(title) => {
              patch({ title });
            }}
          />
          <ArticleCoverOverrideField
            platform="douyin"
            draft={draft}
            commonCovers={commonCovers}
            disabled={disabled}
            onEdit={onEditCover}
            patch={patch}
          />
        </>
      }
      publish={
        <>
          <ArticleTagsField
            tagsText={draft.tagsText}
            maxCount={spec.tags.maxCount}
            disabled={disabled}
            onChange={(tagsText) => {
              patch({ tagsText });
            }}
          />
          <ArticleVisibilityField
            accountId={account.id}
            value={draft.visibility}
            options={spec.visibility ?? ['public']}
            disabled={disabled}
            onChange={(visibility) => {
              patch({ visibility });
            }}
          />
          <ArticleScheduleField
            accountId={account.id}
            scheduledLocal={draft.scheduledLocal}
            minHours={spec.schedule!.minHours}
            maxDays={spec.schedule!.maxDays}
            disabled={disabled}
            onChange={(scheduledLocal) => {
              patch({ scheduledLocal });
            }}
          />
        </>
      }
    />
  );
}
