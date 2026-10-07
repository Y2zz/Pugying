import { ArticleRadioField } from "./ArticleRadioField";
import { Switch } from "@/components/ui/switch";
import { useId, type ReactNode } from "react";
import { DateTimePicker } from "@/components/DateTimePicker";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { formatLocalDateTime, getDateTimeWindow } from "@/lib/date-time";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  ContentVisibility,
  CoverKind,
  PlatformAccountItem,
  PlatformId,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { TagInput } from "../../publish-video/TagInput";
import { ArticleCoverThumb } from "../ArticleCoverThumb";
import {
  countArticleAccountTitleCharacters,
  normalizeArticleTitle,
} from "../article-title";
import {
  articleCoverAspects,
  isArticleCoverRequired,
  validateArticleSchedule,
} from "../article-platform-fields";
import {
  COVER_ASPECT_LABEL,
  VISIBILITY_OPTIONS,
  coverSlotReady,
  effectiveCover,
  emptyCoverSlot,
  localInputToIso,
  parseTags,
  type ArticleOverrideDraft,
  type CoverPair,
} from "../helpers";

/** 各平台图文账号表单共用 props（正文全账号共用，不在此编辑） */
export type ArticlePlatformAccountFormProps = {
  account: PlatformAccountItem;
  draft: ArticleOverrideDraft;
  commonTitle: string;
  commonBody?: string;
  commonCovers: CoverPair;
  disabled?: boolean;
  onDraftChange: (draft: ArticleOverrideDraft) => void;
  onEditCover: (aspect: CoverKind, extraIndex?: 0 | 1) => void;
};

export type DraftPatch = (partial: Partial<ArticleOverrideDraft>) => void;

export function draftPatcher(
  draft: ArticleOverrideDraft,
  onDraftChange: (draft: ArticleOverrideDraft) => void,
): DraftPatch {
  return (partial) => {
    onDraftChange({ ...draft, ...partial });
  };
}

/** 账号表单骨架：「内容」只放可覆盖通用内容的项，「发布设置」放平台独有选项 */
export function ArticleAccountFormLayout({
  content,
  publish,
}: {
  content: ReactNode;
  publish: ReactNode;
}) {
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend>内容</FieldLegend>
        <FieldGroup className="gap-5">{content}</FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>发布设置</FieldLegend>
        <FieldGroup className="gap-5">{publish}</FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}

export function ArticleTitleOverrideField({
  accountId,
  value,
  commonTitle,
  max,
  min = 0,
  validationMessage,
  disabled,
  onChange,
}: {
  accountId: string;
  value: string;
  commonTitle: string;
  max: number;
  min?: number;
  validationMessage?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = `article-${accountId}-title`;
  // 计数按账号实际会用的标题：未单独填写时即通用标题
  const effectiveLength = countArticleAccountTitleCharacters(
    value.trim() || commonTitle,
  );
  const over = effectiveLength > max;
  const tooShort = effectiveLength > 0 && effectiveLength < min;
  const error = over
    ? `该平台标题最多 ${max} 字`
    : tooShort
      ? `该平台标题至少 ${min} 字`
      : (validationMessage ?? "");

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id} className="font-normal">
        标题
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={value}
          placeholder={normalizeArticleTitle(commonTitle) || "沿用通用标题"}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          onBlur={(e) => {
            onChange(normalizeArticleTitle(e.target.value));
          }}
        />
        <InputGroupAddon align="inline-end" className="pointer-events-none">
          <span
            className={cn(
              "text-xs tabular-nums",
              over ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {effectiveLength}/{max}
          </span>
        </InputGroupAddon>
      </InputGroup>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

export function ArticleCoverOverrideField({
  platform,
  hideLabel = false,
  className,
  draft,
  commonCovers,
  disabled,
  onEdit,
  patch,
  aspects: aspectsOverride,
  isRequired: isRequiredOverride,
}: {
  platform: PlatformId;
  hideLabel?: boolean;
  className?: string;
  draft: ArticleOverrideDraft;
  commonCovers: CoverPair;
  disabled?: boolean;
  onEdit: (aspect: CoverKind) => void;
  patch: DraftPatch;
  /** 图文等形态可覆盖文章默认的封面比例解析 */
  aspects?: CoverKind[];
  isRequired?: (aspect: CoverKind) => boolean;
}) {
  const aspects = aspectsOverride ?? articleCoverAspects(platform);
  if (aspects.length === 0) {
    return null;
  }

  return (
    <Field className={className}>
      {!hideLabel ? (
        <FieldTitle className="font-normal">封面</FieldTitle>
      ) : null}
      <div className="flex flex-wrap items-start gap-4">
        {aspects.map((aspect) => {
          const { slot, own } = effectiveCover(draft, commonCovers, aspect);
          const ready = coverSlotReady(slot);
          const required = isRequiredOverride
            ? isRequiredOverride(aspect)
            : isArticleCoverRequired(platform, aspect);
          return (
            <div key={aspect} className="flex flex-col items-start gap-1.5">
              <ArticleCoverThumb
                aspect={aspect}
                src={slot.previewUrl}
                disabled={disabled}
                className="h-28"
                onClick={() => {
                  onEdit(aspect);
                }}
              />
              <span className="text-xs text-muted-foreground">
                {COVER_ASPECT_LABEL[aspect]} ·{" "}
                {own
                  ? "单独设置"
                  : ready
                    ? "沿用通用"
                    : required
                      ? "未设置"
                      : "可选"}
              </span>
              {own ? (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto px-0"
                  disabled={disabled}
                  onClick={() => {
                    patch({
                      covers: { ...draft.covers, [aspect]: emptyCoverSlot() },
                    });
                  }}
                >
                  恢复通用
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Field>
  );
}

export function ArticleTagsField({
  validationMessage,
  tagsText,
  maxCount,
  disabled,
  onChange,
}: {
  tagsText: string;
  validationMessage?: string;
  maxCount: number;
  disabled?: boolean;
  onChange: (tagsText: string) => void;
}) {
  const id = useId();
  const tags = parseTags(tagsText);
  const over = tags.length > maxCount;
  const error = over
    ? `最多 ${maxCount} 个话题，请删除 ${tags.length - maxCount} 个`
    : validationMessage;
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id} className="font-normal">
        话题
      </FieldLabel>
      <TagInput
        id={id}
        invalid={Boolean(error)}
        errorId={error ? `${id}-error` : undefined}
        value={tags}
        disabled={disabled}
        onChange={(next) => {
          onChange(next.join(" "));
        }}
      />
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : (
        <FieldDescription className="text-xs">
          最多 {maxCount} 个
        </FieldDescription>
      )}
    </Field>
  );
}

export function ArticleVisibilityField({
  accountId,
  value,
  options,
  label = "谁可以看",
  publicLabel,
  control = "toggle",
  disabled,
  onChange,
}: {
  accountId: string;
  value: ContentVisibility;
  options: ContentVisibility[];
  label?: string;
  publicLabel?: string;
  control?: "toggle" | "radio";
  disabled?: boolean;
  onChange: (value: ContentVisibility) => void;
}) {
  const id = `article-${accountId}-visibility`;
  const items = VISIBILITY_OPTIONS.filter((opt) => options.includes(opt.value));
  // 草稿里可能留着其他平台的取值（如批量设置），按本平台可选项归一
  const current = options.includes(value) ? value : options[0];
  if (control === "radio") {
    return (
      <ArticleRadioField
        id={id}
        label={label}
        value={current}
        disabled={disabled}
        options={items.map((item) => ({
          value: item.value,
          label:
            item.value === "public" && publicLabel ? publicLabel : item.label,
        }))}
        onChange={(next) => {
          const item = items.find((option) => option.value === next);
          if (item) {
            onChange(item.value);
          }
        }}
      />
    );
  }
  return (
    <Field data-disabled={disabled || undefined}>
      <FieldTitle id={id} className="font-normal">
        {label}
      </FieldTitle>
      <ToggleGroup
        aria-labelledby={id}
        value={[current]}
        multiple={false}
        disabled={disabled}
        variant="outline"
        size="sm"
        className="flex-wrap"
        onValueChange={(values) => {
          const next = items.find((item) => item.value === values[0]);
          if (next) {
            onChange(next.value);
          }
        }}
      >
        {items.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value}>
            {opt.value === "public" && publicLabel ? publicLabel : opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

export function ArticleScheduleField({
  accountId,
  scheduledLocal,
  minHours,
  maxDays,
  disabled,
  onChange,
  control = "toggle",
}: {
  accountId: string;
  scheduledLocal: string;
  control?: "toggle" | "radio" | "switch";
  minHours: number;
  maxDays: number;
  disabled?: boolean;
  onChange: (scheduledLocal: string) => void;
}) {
  const switchId = `article-${accountId}-schedule-enabled`;
  const pickerId = `article-${accountId}-schedule`;
  const enabled = Boolean(scheduledLocal.trim());
  const iso = localInputToIso(scheduledLocal);
  const scheduleError = scheduledLocal.trim()
    ? iso
      ? validateArticleSchedule(iso, { minHours, maxDays })
      : "时间无效"
    : null;

  const changeMode = (next: string) => {
    if (next === "now") {
      onChange("");
    } else if (next === "scheduled" && !enabled) {
      const minimum = getDateTimeWindow({ minHours, maxDays }, Date.now()).min!;
      onChange(formatLocalDateTime(minimum));
    }
  };
  const ScheduleGroup = control === "switch" ? FieldSet : FieldGroup;
  return (
    <ScheduleGroup className="gap-3">
      {control === "switch" ? (
        <FieldLegend variant="label" className="mb-0 font-normal">
          发布时间
        </FieldLegend>
      ) : null}
      {control === "radio" ? (
        <ArticleRadioField
          id={switchId}
          label="发布时间"
          value={enabled ? "scheduled" : "now"}
          disabled={disabled}
          options={[
            { value: "now", label: "立即发布" },
            { value: "scheduled", label: "定时发布" },
          ]}
          onChange={changeMode}
        />
      ) : control === "switch" ? (
        <Field
          orientation="horizontal"
          className="w-fit"
          data-disabled={disabled || undefined}
        >
          <FieldLabel htmlFor={switchId} className="font-normal">
            定时发布
          </FieldLabel>
          <Switch
            id={switchId}
            checked={enabled}
            disabled={disabled}
            onCheckedChange={(checked) => {
              changeMode(checked ? "scheduled" : "now");
            }}
          />
        </Field>
      ) : (
        <Field>
          <FieldTitle id={switchId} className="font-normal">
            发布时间
          </FieldTitle>
          <ToggleGroup
            aria-labelledby={switchId}
            value={[enabled ? "scheduled" : "now"]}
            multiple={false}
            variant="outline"
            size="sm"
            disabled={disabled}
            onValueChange={(values) => {
              changeMode(values[0]);
            }}
          >
            <ToggleGroupItem value="now">立即发布</ToggleGroupItem>
            <ToggleGroupItem value="scheduled">定时发布</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      )}
      {enabled ? (
        <Field
          className="max-w-sm"
          data-invalid={scheduleError ? true : undefined}
        >
          <FieldLabel htmlFor={pickerId} className="sr-only">
            发布时间
          </FieldLabel>
          <DateTimePicker
            id={pickerId}
            aria-invalid={Boolean(scheduleError) || undefined}
            aria-describedby={scheduleError ? `${pickerId}-error` : undefined}
            disabled={disabled}
            value={scheduledLocal}
            onChange={onChange}
            minHours={minHours}
            maxDays={maxDays}
          />
          {scheduleError ? (
            <FieldError id={`${pickerId}-error`}>{scheduleError}</FieldError>
          ) : null}
        </Field>
      ) : null}
    </ScheduleGroup>
  );
}

export function ArticleTextField({
  id,
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-normal">
        {label}
      </FieldLabel>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </Field>
  );
}
