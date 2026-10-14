import { FieldDescription } from "@/components/ui/field";
import { DouyinDeclarationField } from "./DouyinDeclarationField";
import { getGraphicPlatformFields } from "../graphic-platform-fields";
import {
  ArticleAccountFormLayout,
  ArticleScheduleField,
  ArticleTagsField,
  ArticleTitleOverrideField,
  ArticleVisibilityField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from "../../publish-article/account-forms/shared-fields";

const spec = getGraphicPlatformFields("xiaohongshu");

/** 小红书图文：首图为封面，标题、可见性、定时与自主声明按账号设置。 */
export function XiaohongshuGraphicAccountForm({
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
          <FieldDescription>第一张配图作为笔记封面。</FieldDescription>
          {draft.tagsText.trim() && (
            <ArticleTagsField
              tagsText={draft.tagsText}
              maxCount={10}
              validationMessage="请将原有话题写入文案后清空此项"
              disabled={disabled}
              onChange={(tagsText) => {
                patch({ tagsText });
              }}
            />
          )}
        </>
      }
      publish={
        <>
          <ArticleVisibilityField
            accountId={account.id}
            value={draft.visibility}
            options={spec.visibility ?? ["public"]}
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
          <DouyinDeclarationField
            accountId={account.id}
            value={draft.authorDeclaration}
            disabled={disabled}
            onChange={(authorDeclaration) => {
              patch({ authorDeclaration });
            }}
            options={[
              { value: "none", label: "无需添加自主声明" },
              { value: "ai_generated", label: "笔记含AI合成内容" },
              { value: "marketing", label: "内容包含营销广告" },
              { value: "fictional", label: "虚构演绎，仅供娱乐" },
              { value: "reposted", label: "来源转载" },
            ]}
          />
        </>
      }
    />
  );
}
