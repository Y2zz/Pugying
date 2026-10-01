import { getArticlePlatformFields } from '../article-platform-fields';
import {
  ArticleAccountFormLayout,
  ArticleCoverOverrideField,
  ArticleScheduleField,
  ArticleTagsField,
  ArticleTextField,
  ArticleTitleOverrideField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from './shared-fields';

const spec = getArticlePlatformFields('bilibili');

/** 哔哩哔哩专栏：标题 / 横版封面可覆盖；分区、话题、定时 */
export function BilibiliArticleAccountForm({
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
            platform="bilibili"
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
          <ArticleTextField
            id={`article-${account.id}-partition`}
            label={spec.partition.label}
            value={draft.partition}
            placeholder="如：生活"
            disabled={disabled}
            onChange={(partition) => {
              patch({ partition });
            }}
          />
          <ArticleTagsField
            tagsText={draft.tagsText}
            maxCount={spec.tags.maxCount}
            disabled={disabled}
            onChange={(tagsText) => {
              patch({ tagsText });
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
