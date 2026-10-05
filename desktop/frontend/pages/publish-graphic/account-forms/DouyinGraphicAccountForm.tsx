import { composeDouyinGraphicDescription } from "@shared/douyin-graphic-settings";
import { parseTags } from "../../publish-article/helpers";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  graphicCoverAspects,
  getGraphicPlatformFields,
  isGraphicCoverRequired,
} from "../graphic-platform-fields";
import {
  ArticleCoverOverrideField,
  ArticleTagsField,
  ArticleTitleOverrideField,
  ArticleVisibilityField,
  draftPatcher,
  type ArticlePlatformAccountFormProps,
} from "../../publish-article/account-forms/shared-fields";
import { DouyinDeclarationField } from "./DouyinDeclarationField";
import { DouyinPublishTimeField } from "./DouyinPublishTimeField";

const spec = getGraphicPlatformFields("douyin");

/** 通用图片与描述保留在主编辑区；抖音账号侧按创作者后台分组。 */
export function DouyinGraphicAccountForm({
  account,
  draft,
  commonTitle,
  commonBody = "",
  commonCovers,
  disabled,
  onDraftChange,
  onEditCover,
}: ArticlePlatformAccountFormProps) {
  const patch = draftPatcher(draft, onDraftChange);
  const downloadId = `graphic-${account.id}-download`;
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend>基础信息</FieldLegend>
        <FieldDescription>未修改项沿用通用内容</FieldDescription>
        <FieldGroup className="gap-5">
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
          <ArticleTagsField
            tagsText={draft.tagsText}
            validationMessage={
              composeDouyinGraphicDescription(
                commonBody,
                parseTags(draft.tagsText),
              ).length > spec.bodyPlainMax
                ? `文案与话题合计最多 ${spec.bodyPlainMax} 字，请缩短文案或减少话题`
                : undefined
            }
            maxCount={spec.tags.maxCount}
            disabled={disabled}
            onChange={(tagsText) => {
              patch({ tagsText });
            }}
          />
          <ArticleCoverOverrideField
            platform="douyin"
            draft={draft}
            commonCovers={commonCovers}
            disabled={disabled}
            onEdit={onEditCover}
            patch={patch}
            aspects={graphicCoverAspects("douyin")}
            isRequired={(aspect) => isGraphicCoverRequired("douyin", aspect)}
          />
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>扩展信息</FieldLegend>
        <FieldGroup className="gap-5">
          <DouyinDeclarationField
            accountId={account.id}
            value={draft.authorDeclaration}
            disabled={disabled}
            onChange={(authorDeclaration) => {
              patch({ authorDeclaration });
            }}
          />
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>发布设置</FieldLegend>
        <FieldGroup className="gap-5">
          <ArticleVisibilityField
            accountId={account.id}
            value={draft.visibility}
            options={spec.visibility!}
            disabled={disabled}
            onChange={(visibility) => {
              patch({ visibility });
            }}
          />
          <Field data-disabled={disabled || undefined}>
            <FieldTitle id={downloadId}>保存权限</FieldTitle>
            <ToggleGroup
              aria-labelledby={downloadId}
              value={[draft.allowDownload === false ? "deny" : "allow"]}
              multiple={false}
              variant="outline"
              size="sm"
              disabled={disabled}
              onValueChange={(values) => {
                if (values[0] === "allow" || values[0] === "deny") {
                  patch({ allowDownload: values[0] === "allow" });
                }
              }}
            >
              <ToggleGroupItem value="allow">允许</ToggleGroupItem>
              <ToggleGroupItem value="deny">不允许</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <DouyinPublishTimeField
            accountId={account.id}
            value={draft.scheduledLocal}
            disabled={disabled}
            onChange={(scheduledLocal) => {
              patch({ scheduledLocal });
            }}
          />
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}
