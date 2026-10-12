import { topicNames } from '@shared/platform-resource';
import { ArticlePlatformSettingsFields } from './ArticlePlatformSettingsFields';
import { DouyinTopicField } from './DouyinTopicField';
import { getArticlePlatformFields } from '../article-platform-fields';
import {
  ArticleAccountFormLayout,
  ArticleCoverOverrideField,
  ArticleScheduleField,
  ArticleTitleOverrideField,
  ArticleVisibilityField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from './shared-fields';

const spec = getArticlePlatformFields('douyin');

/** 抖音发文章：标题 / 竖版双列封面可覆盖；话题、谁可以看、定时 */
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
          <ArticlePlatformSettingsFields
            accountId={account.id}
            platform="douyin"
            value={draft.articleSettings}
            disabled={disabled}
            onChange={(articleSettings) => {
              patch({ articleSettings });
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
          <DouyinTopicField
            accountId={account.id}
            value={draft.topicRefs}
            maxCount={spec.tags.maxCount}
            disabled={disabled}
            onChange={(topicRefs) => {
              patch({
                topicRefs,
                tagsText: topicNames(topicRefs).join(' '),
              });
            }}
          />
          <ArticleVisibilityField
            control="radio"
            accountId={account.id}
            value={draft.visibility}
            options={spec.visibility ?? ['public']}
            disabled={disabled}
            onChange={(visibility) => {
              patch({ visibility });
            }}
          />
          <ArticleScheduleField
            control="radio"
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
