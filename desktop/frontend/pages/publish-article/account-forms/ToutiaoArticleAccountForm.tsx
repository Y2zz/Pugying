import { ToutiaoArticleCoverField } from "./ArticleCoverModeFields";
import { ArticlePlatformSettingsFields } from "./ArticlePlatformSettingsFields";
import { getArticlePlatformFields } from "../article-platform-fields";
import {
  ArticleAccountFormLayout,
  ArticleScheduleField,
  ArticleTitleOverrideField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from "./shared-fields";

const spec = getArticlePlatformFields("toutiao");

/** 头条文章：标题、封面，以及广告、首发、赞赏和作品声明。 */
export function ToutiaoArticleAccountForm({
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
            min={2}
            disabled={disabled}
            onChange={(title) => {
              patch({ title });
            }}
          />
          <ToutiaoArticleCoverField
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
          <ArticlePlatformSettingsFields
            accountId={account.id}
            platform="toutiao"
            value={draft.articleSettings}
            disabled={disabled}
            onChange={(articleSettings) => {
              patch({ articleSettings });
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
