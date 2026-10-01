import {
  graphicCoverAspects,
  getGraphicPlatformFields,
  isGraphicCoverRequired,
} from '../graphic-platform-fields';
import {
  ArticleAccountFormLayout,
  ArticleCoverOverrideField,
  ArticleScheduleField,
  ArticleTagsField,
  ArticleTextField,
  ArticleTitleOverrideField,
  ArticleVisibilityField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from '../../publish-article/account-forms/shared-fields';

const spec = getGraphicPlatformFields('xiaohongshu');

/** 小红书图文：标题 / 竖版封面可覆盖；话题、地点、可见性、定时 */
export function XiaohongshuGraphicAccountForm({
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
            platform="xiaohongshu"
            draft={draft}
            commonCovers={commonCovers}
            disabled={disabled}
            onEdit={onEditCover}
            patch={patch}
            aspects={graphicCoverAspects('xiaohongshu')}
            isRequired={(aspect) => isGraphicCoverRequired('xiaohongshu', aspect)}
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
          <ArticleTextField
            id={`graphic-${account.id}-location`}
            label="地点"
            value={draft.location}
            placeholder="可选"
            disabled={disabled}
            onChange={(location) => {
              patch({ location });
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
