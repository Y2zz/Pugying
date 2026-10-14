import { FieldDescription } from '@/components/ui/field';
import { getGraphicPlatformFields } from '../graphic-platform-fields';
import {
  ArticleAccountFormLayout,
  ArticleTagsField,
  ArticleTitleOverrideField,
  ArticleVisibilityField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from '../../publish-article/account-forms/shared-fields';

const spec = getGraphicPlatformFields('channels');

/** 视频号图文：首图为封面；话题写入描述；默认可仅自己可见。 */
export function ChannelsGraphicAccountForm({
  account,
  draft,
  commonTitle,
  disabled,
  onDraftChange,
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
          <FieldDescription>第一张配图作为封面。</FieldDescription>
          <ArticleTagsField
            tagsText={draft.tagsText}
            maxCount={spec.tags.maxCount}
            disabled={disabled}
            onChange={(tagsText) => {
              patch({ tagsText });
            }}
          />
        </>
      }
      publish={
        <>
          <ArticleVisibilityField
            accountId={account.id}
            value={draft.visibility}
            options={spec.visibility ?? ['private', 'public']}
            disabled={disabled}
            onChange={(visibility) => {
              patch({ visibility });
            }}
          />
          <FieldDescription>立即发布。试发建议选「仅自己可见」。</FieldDescription>
        </>
      }
    />
  );
}
