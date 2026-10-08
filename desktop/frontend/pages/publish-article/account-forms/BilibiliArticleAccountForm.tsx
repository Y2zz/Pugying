import { BilibiliArticleCoverField } from "./ArticleCoverModeFields";
import { ArticlePlatformSettingsFields } from "./ArticlePlatformSettingsFields";
import { getArticlePlatformFields } from "../article-platform-fields";
import { BilibiliAnthologyField } from "./BilibiliAnthologyField";
import {
  ArticleAccountFormLayout,
  ArticleScheduleField,
  ArticleVisibilityField,
  ArticleTitleOverrideField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from "./shared-fields";

const spec = getArticlePlatformFields("bilibili");

/** 新版专栏：可选封面、可见范围、评论、原创声明和定时。 */
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
          <BilibiliArticleCoverField
            account={account}
            draft={draft}
            commonCovers={commonCovers}
            disabled={disabled}
            onEditCover={onEditCover}
            patch={patch}
          />
        </>
      }
      publish={
        <>
          <ArticleVisibilityField
            control="radio"
            accountId={account.id}
            value={draft.visibility}
            options={spec.visibility!}
            label="可见范围"
            publicLabel="所有人可见"
            disabled={disabled}
            onChange={(visibility) => {
              patch({ visibility });
            }}
          />
          <ArticlePlatformSettingsFields
            accountId={account.id}
            platform="bilibili"
            value={draft.articleSettings}
            disabled={disabled}
            onChange={(articleSettings) => {
              patch({ articleSettings });
            }}
          />
          <BilibiliAnthologyField
            accountId={account.id}
            value={draft.anthologyRefs}
            disabled={disabled}
            onChange={(anthologyRefs) => {
              patch({ anthologyRefs });
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
