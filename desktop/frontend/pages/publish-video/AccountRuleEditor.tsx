import { BilibiliVideoFields } from "./BilibiliVideoFields";
import { useState, type RefObject } from "react";
import {
  DOUYIN_AUTHOR_DECLARATIONS,
  composeDouyinGraphicDescription,
} from "@shared/douyin-graphic-settings";
import { topicNames } from "@shared/platform-resource";
import { DateTimePicker } from "@/components/DateTimePicker";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { ArticleRadioField } from "../publish-article/account-forms/ArticleRadioField";
import { DouyinTopicField } from "../publish-article/account-forms/DouyinTopicField";
import { formatLocalDateTime, getDateTimeWindow } from "@/lib/date-time";
import type { PlatformAccountItem } from "@/lib/api";
import { CharCountInput, CharCountTextarea } from "./CharCountFields";
import { ArticleCoverThumb } from "../publish-article/ArticleCoverThumb";
import { TagInput } from "./TagInput";
import { DouyinDeclarationField } from "../publish-graphic/account-forms/DouyinDeclarationField";
import {
  BODY_MAX,
  TITLE_MAX,
  VISIBILITY_OPTIONS,
  draftTagNames,
  parseTags,
  localInputToIso,
  validateSchedule,
  type CoverKind,
  type OverrideDraft,
} from "./helpers";

/** 通用文案：仅标题与描述，作为各账号默认值 */
export function ContentInfoForm({
  title,
  setTitle,
  body,
  setBody,
  titleInputRef,
  validationAttempted = false,
  disabled,
}: {
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  validationAttempted?: boolean;
}) {
  const [titleTouched, setTitleTouched] = useState(false);
  const titleError =
    (titleTouched || validationAttempted) && !title.trim() ? "请填写标题" : "";
  return (
    <FieldGroup className="gap-4">
      <Field
        data-invalid={
          Boolean(titleError) || title.length > TITLE_MAX || undefined
        }
      >
        <FieldLabel className="font-normal" htmlFor="video-title">
          标题
        </FieldLabel>
        <CharCountInput
          id="video-title"
          ref={titleInputRef}
          validationMessage={titleError}
          onBlur={() => setTitleTouched(true)}
          placeholder="填写作品标题"
          max={TITLE_MAX}
          disabled={disabled}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </Field>

      <Field>
        <FieldLabel className="font-normal" htmlFor="video-body">
          作品简介
        </FieldLabel>
        <CharCountTextarea
          id="video-body"
          placeholder="添加作品简介（可选）"
          max={BODY_MAX}
          disabled={disabled}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
          }}
        />
      </Field>
    </FieldGroup>
  );
}

/** 单个账号：发布选项 + 可选覆盖通用标题/描述/封面（主从右侧编辑区使用） */
export function AccountOverrideForm({
  account,
  draft,
  commonTitle,
  commonBody,
  commonCoverPreviewUrl,
  commonCoverLandscapePreviewUrl,
  coverDisabled,
  onDraftChange,
  onEditCover,
  disabled,
  portraitOnly = false,
}: {
  account: PlatformAccountItem;
  draft: OverrideDraft;
  commonTitle: string;
  commonBody: string;
  commonCoverReady: boolean;
  commonCoverLandscapeReady: boolean;
  commonCoverPreviewUrl: string | null;
  commonCoverLandscapePreviewUrl: string | null;
  coverDisabled?: boolean;
  onDraftChange: (draft: OverrideDraft) => void;
  onEditCover: (kind: CoverKind) => void;
  disabled?: boolean;
  /** 图文账号差异封面仅竖版 */
  portraitOnly?: boolean;
}) {
  const bilibili = account.platform === "bilibili";
  const toutiao = account.platform === "toutiao";
  const xiaohongshu = account.platform === "xiaohongshu";
  const channels = account.platform === "channels";
  const titleMax = channels ? 16 : xiaohongshu ? 20 : TITLE_MAX;
  const minHours = toutiao || bilibili ? 1 / 60 : xiaohongshu ? 1 : 2;
  const maxDays = toutiao || bilibili ? undefined : 14;
  const scheduleEnabled = Boolean(draft.scheduledLocal.trim());
  const scheduleError = scheduleEnabled
    ? channels
      ? "视频号短视频暂不支持定时发布"
      : validateSchedule(localInputToIso(draft.scheduledLocal), account.platform)
    : null;

  const patch = (partial: Partial<OverrideDraft>) => {
    onDraftChange({ ...draft, ...partial });
  };

  const resolvedTitle = draft.title.trim() || commonTitle;
  const titleError = channels
    ? resolvedTitle.length > 0 &&
      (resolvedTitle.length < 6 || resolvedTitle.length > 16)
      ? "标题需为 6 至 16 字"
      : ""
    : resolvedTitle.length > titleMax
      ? `标题最多 ${titleMax} 字`
      : "";
  const tags = draftTagNames(draft);
  const bodyError =
    (bilibili
      ? (draft.body.trim() || commonBody).length
      : channels
        ? (() => {
            const topicSuffix = tags.map((tag) => `#${tag}`).join(" ");
            const text = draft.body.trim() || commonBody;
            return [text, topicSuffix]
              .filter(Boolean)
              .join(text && topicSuffix ? " " : "").length;
          })()
        : composeDouyinGraphicDescription(draft.body.trim() || commonBody, tags)
            .length) > BODY_MAX
      ? `简介与话题合计最多 ${BODY_MAX} 字`
      : "";

  const accountCoverReady =
    Boolean(draft.coverBlob) ||
    draft.hasCover ||
    Boolean(draft.coverPreviewUrl.trim());
  const accountLandscapeReady =
    Boolean(draft.coverLandscapeBlob) ||
    draft.hasCoverLandscape ||
    Boolean(draft.coverLandscapePreviewUrl.trim());

  const portraitSrc =
    draft.coverPreviewUrl.trim() || commonCoverPreviewUrl || null;
  const landscapeSrc =
    draft.coverLandscapePreviewUrl.trim() ||
    commonCoverLandscapePreviewUrl ||
    null;

  return (
    <FieldGroup className="gap-4">
      <FieldSet>
        <FieldLegend>基础信息</FieldLegend>
        <FieldGroup className="gap-5">
          <Field data-invalid={Boolean(titleError) || undefined}>
            <FieldLabel
              className="font-normal"
              htmlFor={`ov-${account.id}-title`}
            >
              标题
            </FieldLabel>
            <CharCountInput
              id={`ov-${account.id}-title`}
              validationMessage={titleError}
              placeholder={commonTitle.trim() || "沿用通用标题"}
              max={titleMax}
              disabled={disabled}
              value={draft.title}
              onChange={(e) => {
                patch({ title: e.target.value });
              }}
            />
          </Field>

          <Field>
            <FieldTitle className="font-normal">封面</FieldTitle>
            <div className="mt-2 flex flex-wrap items-start gap-4">
              <div className="flex flex-col gap-2">
                <ArticleCoverThumb
                  aspect="portrait"
                  src={portraitSrc}
                  className="h-24"
                  disabled={disabled || coverDisabled}
                  onClick={() => {
                    onEditCover("cover");
                  }}
                />
                <span className="text-xs text-muted-foreground">竖版 3:4</span>
              </div>
              {!portraitOnly ? (
                <div className="flex flex-col gap-2">
                  <ArticleCoverThumb
                    aspect="landscape"
                    src={landscapeSrc}
                    className="h-24"
                    disabled={disabled || coverDisabled}
                    onClick={() => {
                      onEditCover("cover_landscape");
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    横版 4:3
                  </span>
                </div>
              ) : null}
            </div>
            {!accountCoverReady && (portraitOnly || !accountLandscapeReady) ? (
              <p className="mt-2 text-xs text-muted-foreground">沿用通用封面</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                已单独设置封面
              </p>
            )}
          </Field>

          <Field data-invalid={Boolean(bodyError) || undefined}>
            <FieldLabel
              className="font-normal"
              htmlFor={`ov-${account.id}-body`}
            >
              作品简介
            </FieldLabel>
            <CharCountTextarea
              id={`ov-${account.id}-body`}
              validationMessage={bodyError}
              placeholder={commonBody.trim() || "沿用通用描述"}
              max={BODY_MAX}
              className="min-h-16"
              disabled={disabled}
              value={draft.body}
              onChange={(e) => {
                patch({ body: e.target.value });
              }}
            />
          </Field>
          {account.platform === "douyin" ? (
            <DouyinTopicField
              accountId={account.id}
              value={draft.topicRefs}
              maxCount={5}
              disabled={disabled}
              onChange={(topicRefs) => {
                patch({
                  topicRefs,
                  tagsText: topicNames(topicRefs).join(" "),
                });
              }}
            />
          ) : ((!xiaohongshu && !toutiao) || tags.length > 0) && (
            <Field>
              <FieldLabel
                className="font-normal"
                htmlFor={`ov-${account.id}-tags`}
              >
                话题
              </FieldLabel>
              <TagInput
                id={`ov-${account.id}-tags`}
                value={tags}
                disabled={disabled}
                onChange={(next) => {
                  patch({
                    tagsText: next.join(" "),
                    topicRefs: [],
                  });
                }}
              />
            </Field>
          )}
          {account.platform === "bilibili" ? (
            <BilibiliVideoFields
              accountId={account.id}
              value={draft.bilibiliVideoSettings}
              disabled={disabled}
              onChange={(bilibiliVideoSettings) =>
                patch({ bilibiliVideoSettings })
              }
            />
          ) : channels ? null : (
            <DouyinDeclarationField
              options={
                xiaohongshu
                  ? DOUYIN_AUTHOR_DECLARATIONS.filter(
                      (option) => option.value !== "personal_opinion",
                    )
                  : toutiao
                    ? DOUYIN_AUTHOR_DECLARATIONS.filter(
                        (option) => option.value !== "marketing",
                      )
                    : DOUYIN_AUTHOR_DECLARATIONS
              }
              accountId={`video-${account.id}`}
              value={draft.authorDeclaration}
              disabled={disabled}
              onChange={(authorDeclaration) => {
                patch({ authorDeclaration });
              }}
            />
          )}
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>发布设置</FieldLegend>
        <FieldGroup className="gap-5">
          <ArticleRadioField
            id={`ov-${account.id}-visibility`}
            label="谁可以看"
            value={draft.visibility}
            options={
              xiaohongshu || toutiao || bilibili || channels
                ? VISIBILITY_OPTIONS.filter(
                    (option) => option.value !== "friends",
                  )
                : VISIBILITY_OPTIONS
            }
            disabled={disabled}
            onChange={(value) => {
              patch({ visibility: value as OverrideDraft["visibility"] });
            }}
          />
          {!xiaohongshu && !toutiao && !bilibili && !channels && (
            <ArticleRadioField
              id={`ov-${account.id}-download`}
              label="保存权限"
              value={draft.allowDownload ? "allow" : "deny"}
              disabled={disabled}
              options={[
                { value: "allow", label: "允许" },
                { value: "deny", label: "不允许" },
              ]}
              onChange={(value) => {
                patch({ allowDownload: value === "allow" });
              }}
            />
          )}
          {channels ? (
            <FieldDescription>立即发布。试发建议选「仅自己可见」。</FieldDescription>
          ) : (
            <>
              <ArticleRadioField
                id={`ov-${account.id}-publish-time`}
                label="发布时间"
                value={scheduleEnabled ? "scheduled" : "now"}
                disabled={disabled}
                options={[
                  { value: "now", label: "立即发布" },
                  { value: "scheduled", label: "定时发布" },
                ]}
                onChange={(value) => {
                  patch({
                    scheduledLocal:
                      value === "now"
                        ? ""
                        : formatLocalDateTime(
                            getDateTimeWindow({ minHours, maxDays }, Date.now())
                              .min!,
                          ),
                  });
                }}
              />
              {scheduleEnabled ? (
                <Field data-invalid={Boolean(scheduleError) || undefined}>
                  <FieldLabel
                    className="sr-only"
                    htmlFor={`ov-${account.id}-schedule`}
                  >
                    定时发布时间
                  </FieldLabel>
                  <DateTimePicker
                    id={`ov-${account.id}-schedule`}
                    aria-invalid={Boolean(scheduleError) || undefined}
                    aria-describedby={
                      scheduleError
                        ? `ov-${account.id}-schedule-error`
                        : undefined
                    }
                    minHours={minHours}
                    maxDays={maxDays}
                    disabled={disabled}
                    value={draft.scheduledLocal}
                    onChange={(value) => {
                      patch({ scheduledLocal: value });
                    }}
                  />
                  {scheduleError ? (
                    <FieldError id={`ov-${account.id}-schedule-error`}>
                      {scheduleError}
                    </FieldError>
                  ) : null}
                </Field>
              ) : null}
            </>
          )}
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}
