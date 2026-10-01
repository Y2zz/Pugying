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

const spec = getArticlePlatformFields('channels');

/** 视频号图文：封面默认取配图，竖版可选；话题、可见性、定时 */
export function ChannelsArticleAccountForm({
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
            platform="channels"
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
