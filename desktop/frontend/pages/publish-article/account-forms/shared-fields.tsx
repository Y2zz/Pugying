import { useEffect, useState, type ReactNode } from 'react';
import { DateTimePicker } from '@/components/DateTimePicker';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ContentVisibility, CoverKind, PlatformAccountItem, PlatformId } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TagInput } from '../../publish-video/TagInput';
import { ArticleCoverThumb } from '../ArticleCoverThumb';
import {
  articleCoverAspects,
  isArticleCoverRequired,
  validateArticleSchedule,
} from '../article-platform-fields';
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
} from '../helpers';

/** 各平台图文账号表单共用 props（正文全账号共用，不在此编辑） */
export type ArticlePlatformAccountFormProps = {
  account: PlatformAccountItem;
  draft: ArticleOverrideDraft;
  commonTitle: string;
  commonCovers: CoverPair;
  disabled?: boolean;
  onDraftChange: (draft: ArticleOverrideDraft) => void;
  onEditCover: (aspect: CoverKind) => void;
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
        <FieldDescription>未修改的项沿用通用内容</FieldDescription>
        <FieldGroup className="gap-5">{content}</FieldGroup>
      </FieldSet>
      <FieldSeparator />
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
  disabled,
  onChange,
}: {
  accountId: string;
  value: string;
  commonTitle: string;
  max: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = `article-${accountId}-title`;
  // 计数按账号实际会用的标题：未单独填写时即通用标题
  const effectiveLength = (value.trim() || commonTitle.trim()).length;
  const over = effectiveLength > max;

  return (
    <Field data-invalid={over || undefined}>
      <FieldLabel htmlFor={id}>标题</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={value}
          placeholder={commonTitle.trim() || '沿用通用标题'}
          disabled={disabled}
          aria-invalid={over || undefined}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
        <InputGroupAddon align="inline-end" className="pointer-events-none">
          <span className={cn('text-xs tabular-nums', over ? 'text-destructive' : 'text-muted-foreground')}>
            {effectiveLength}/{max}
          </span>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>
        {over ? `该平台标题最多 ${max} 字` : value.trim() ? '仅用于该账号' : '留空沿用通用标题'}
      </FieldDescription>
    </Field>
  );
}

export function ArticleCoverOverrideField({
  platform,
  draft,
  commonCovers,
  disabled,
  onEdit,
  patch,
  aspects: aspectsOverride,
  isRequired: isRequiredOverride,
}: {
  platform: PlatformId;
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
    <Field>
      <FieldTitle>封面</FieldTitle>
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
                {COVER_ASPECT_LABEL[aspect]} ·{' '}
                {own ? '单独设置' : ready ? '沿用通用' : required ? '未设置' : '可选'}
              </span>
              {own ? (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto px-0"
                  disabled={disabled}
                  onClick={() => {
                    patch({ covers: { ...draft.covers, [aspect]: emptyCoverSlot() } });
                  }}
                >
                  恢复通用
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <FieldDescription>点击封面可为该账号单独更换</FieldDescription>
    </Field>
  );
}

export function ArticleTagsField({
  tagsText,
  maxCount,
  disabled,
  onChange,
}: {
  tagsText: string;
  maxCount: number;
  disabled?: boolean;
  onChange: (tagsText: string) => void;
}) {
  const tags = parseTags(tagsText);
  const over = tags.length > maxCount;
  return (
    <Field data-invalid={over || undefined}>
      <FieldTitle>话题</FieldTitle>
      <TagInput
        value={tags}
        disabled={disabled}
        onChange={(next) => {
          onChange(next.join(' '));
        }}
      />
      <FieldDescription>
        {over ? `最多 ${maxCount} 个，请删除 ${tags.length - maxCount} 个` : `最多 ${maxCount} 个`}
      </FieldDescription>
    </Field>
  );
}

export function ArticleVisibilityField({
  accountId,
  value,
  options,
  disabled,
  onChange,
}: {
  accountId: string;
  value: ContentVisibility;
  options: ContentVisibility[];
  disabled?: boolean;
  onChange: (value: ContentVisibility) => void;
}) {
  const id = `article-${accountId}-visibility`;
  const items = VISIBILITY_OPTIONS.filter((opt) => options.includes(opt.value));
  // 草稿里可能留着其他平台的取值（如批量设置），按本平台可选项归一
  const current = options.includes(value) ? value : options[0];
  return (
    <Field>
      <FieldLabel htmlFor={id}>谁可以看</FieldLabel>
      <Select
        value={current}
        disabled={disabled}
        items={items}
        onValueChange={(next) => {
          onChange((next as ContentVisibility | null) ?? options[0]);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
}: {
  accountId: string;
  scheduledLocal: string;
  minHours: number;
  maxDays: number;
  disabled?: boolean;
  onChange: (scheduledLocal: string) => void;
}) {
  const switchId = `article-${accountId}-schedule-enabled`;
  const pickerId = `article-${accountId}-schedule`;
  const [enabled, setEnabled] = useScheduleToggle(scheduledLocal);
  const iso = localInputToIso(scheduledLocal);
  const scheduleError = scheduledLocal.trim()
    ? iso
      ? validateArticleSchedule(iso, { minHours, maxDays })
      : '时间无效'
    : null;

  return (
    <>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={switchId}>定时发布</FieldLabel>
          <FieldDescription>
            {minHours} 小时后至 {maxDays} 天内
          </FieldDescription>
        </FieldContent>
        <Switch
          id={switchId}
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => {
            setEnabled(checked);
            if (!checked) {
              onChange('');
            }
          }}
        />
      </Field>
      {enabled ? (
        <Field data-invalid={scheduleError ? true : undefined}>
          <FieldLabel htmlFor={pickerId}>发布时间</FieldLabel>
          <DateTimePicker id={pickerId} disabled={disabled} value={scheduledLocal} onChange={onChange} />
          {scheduleError ? <FieldError>{scheduleError}</FieldError> : null}
        </Field>
      ) : null}
    </>
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
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
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

/**
 * 开关与时间值分离：打开开关但尚未选时间时，草稿仍为空（= 立即发布），
 * 开关需要自己的状态才能显示时间选择器。
 */
function useScheduleToggle(scheduledLocal: string) {
  const [enabled, setEnabled] = useState(Boolean(scheduledLocal.trim()));
  useEffect(() => {
    if (scheduledLocal.trim()) {
      setEnabled(true);
    }
  }, [scheduledLocal]);
  return [enabled, setEnabled] as const;
}
