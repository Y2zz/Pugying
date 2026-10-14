import { FieldDescription } from "@/components/ui/field";
import {
  ArticleAccountFormLayout,
  ArticleTitleOverrideField,
  ArticleTagsField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from "../../publish-article/account-forms/shared-fields";
import { DouyinDeclarationField } from "./DouyinDeclarationField";

export function ToutiaoGraphicAccountForm({
  account,
  draft,
  commonTitle,
  commonBody = "",
  disabled,
  onDraftChange,
}: ArticlePlatformAccountFormProps) {
  const patch = draftPatcher(draft, onDraftChange);
  const over =
    [draft.title.trim() || commonTitle.trim(), commonBody.trim()]
      .filter(Boolean)
      .join("\n\n").length > 2000;
  return (
    <ArticleAccountFormLayout
      content={
        <>
          <ArticleTitleOverrideField
            accountId={account.id}
            value={draft.title}
            commonTitle={commonTitle}
            max={100}
            validationMessage={over ? "标题与文案合计最多 2000 字" : undefined}
            disabled={disabled}
            onChange={(title) => {
              patch({ title });
            }}
          />
          <FieldDescription>
            标题作为微头条文案首行，图片按槽位顺序发布。
          </FieldDescription>
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
          <FieldDescription>微头条发布后公开可见。</FieldDescription>
          <DouyinDeclarationField
            accountId={account.id}
            value={draft.authorDeclaration}
            disabled={disabled}
            onChange={(authorDeclaration) => {
              patch({ authorDeclaration });
            }}
            options={[
              { value: "none", label: "无需添加自主声明" },
              { value: "ai_generated", label: "内容由AI生成" },
              { value: "personal_opinion", label: "个人观点，仅供参考" },
              { value: "reposted", label: "内容来源于网络" },
              { value: "fictional", label: "虚构演绎，仅供娱乐" },
            ]}
          />
        </>
      }
    />
  );
}
