import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { topicRefsFromNames } from '@shared/platform-resource';
import { DateTimePicker } from '@/components/DateTimePicker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContentVisibility } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TagInput } from '../publish-video/TagInput';
import {
  intersectGraphicBulkCapabilities,
  validateGraphicSchedule,
} from './graphic-platform-fields';
import {
  VISIBILITY_OPTIONS,
  localInputToIso,
  type ArticleOverrideDraft,
} from '../publish-article/helpers';
import type { GraphicRosterEntry } from './use-graphic-composer';
import {
  countArticleAccountTitleCharacters,
  normalizeArticleTitle,
} from '../publish-article/article-title';

type BulkField =
  'title' | 'tags' | 'visibility' | 'schedule' | 'location' | 'partition';

interface BulkValues {
  title: string;
  tags: string[];
  visibility: ContentVisibility;
  scheduleMode: 'now' | 'scheduled';
  scheduledLocal: string;
  location: string;
  partition: string;
}

const initialValues = (visibility: ContentVisibility): BulkValues => ({
  title: '',
  tags: [],
  visibility,
  scheduleMode: 'now',
  scheduledLocal: '',
  location: '',
  partition: '',
});

/**
 * 批量设置：只列所选账号平台共同支持的字段（数值取最严）。
 * 改动某项会自动勾选该项，只有勾选的项会写入，其余保持各账号原值。
 */
export function GraphicBulkEditDialog({
  open,
  onOpenChange,
  targets,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: GraphicRosterEntry[];
  onApply: (patch: Partial<ArticleOverrideDraft>) => void;
}) {
  const platforms = useMemo(
    () => [...new Set(targets.map((t) => t.account.platform))],
    [targets],
  );
  const caps = useMemo(
    () => intersectGraphicBulkCapabilities(platforms),
    [platforms],
  );
  const [enabled, setEnabled] = useState<Set<BulkField>>(() => new Set());
  const [values, setValues] = useState<BulkValues>(() =>
    initialValues('public'),
  );

  useEffect(() => {
    if (open) {
      setEnabled(new Set());
      setValues(initialValues(caps.visibility?.[0] ?? 'public'));
    }
  }, [open, caps.visibility]);

  const change = (field: BulkField, partial: Partial<BulkValues>) => {
    setValues((prev) => ({ ...prev, ...partial }));
    setEnabled((prev) => new Set(prev).add(field));
  };

  const toggle = (field: BulkField, on: boolean) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(field);
      } else {
        next.delete(field);
      }
      return next;
    });
  };

  const titleLength = countArticleAccountTitleCharacters(values.title);
  const titleOver = titleLength > caps.titleMax;
  const tagsOver = caps.tags ? values.tags.length > caps.tags.maxCount : false;
  let scheduleError: string | null = null;
  if (caps.schedule && values.scheduleMode === 'scheduled') {
    const iso = localInputToIso(values.scheduledLocal);
    scheduleError = iso
      ? validateGraphicSchedule(iso, caps.schedule)
      : '请选择发布时间';
  }
  const invalid =
    (enabled.has('title') && titleOver) ||
    (enabled.has('tags') && tagsOver) ||
    (enabled.has('schedule') && Boolean(scheduleError));

  const apply = () => {
    const patch: Partial<ArticleOverrideDraft> = {};
    if (enabled.has('title')) {
      patch.title = normalizeArticleTitle(values.title);
    }
    if (enabled.has('tags')) {
      patch.tagsText = values.tags.join(' ');
      patch.topicRefs = topicRefsFromNames(values.tags);
    }
    if (enabled.has('visibility')) {
      patch.visibility = values.visibility;
    }
    if (enabled.has('schedule')) {
      patch.scheduledLocal =
        values.scheduleMode === 'scheduled' ? values.scheduledLocal : '';
    }
    if (enabled.has('location')) {
      patch.location = values.location.trim();
    }
    if (enabled.has('partition')) {
      patch.partition = values.partition.trim();
    }
    onApply(patch);
    onOpenChange(false);
  };

  const visibilityItems = VISIBILITY_OPTIONS.filter((opt) =>
    caps.visibility?.includes(opt.value),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(44rem,85vh)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>批量设置</DialogTitle>
          <DialogDescription>
            应用到已选的 {targets.length} 个账号
            {platforms.length > 1 ? '，仅列出这些平台都支持的项' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          <FieldGroup className="gap-5 py-1">
            <BulkRow
              id="bulk-title"
              label="标题"
              description="留空则恢复为通用标题"
              on={enabled.has('title')}
              onToggle={(on) => {
                toggle('title', on);
              }}
              error={
                enabled.has('title') && titleOver
                  ? `最多 ${caps.titleMax} 字`
                  : null
              }
            >
              <InputGroup>
                <InputGroupInput
                  id="bulk-title"
                  value={values.title}
                  placeholder="沿用通用标题"
                  aria-invalid={titleOver || undefined}
                  onChange={(e) => {
                    change('title', { title: e.target.value });
                  }}
                />
                <InputGroupAddon
                  align="inline-end"
                  className="pointer-events-none"
                >
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      titleOver ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {titleLength}/{caps.titleMax}
                  </span>
                </InputGroupAddon>
              </InputGroup>
            </BulkRow>

            {caps.tags ? (
              <BulkRow
                id="bulk-tags"
                label="话题"
                description={`替换为以下话题，最多 ${caps.tags.maxCount} 个`}
                on={enabled.has('tags')}
                onToggle={(on) => {
                  toggle('tags', on);
                }}
                error={
                  enabled.has('tags') && tagsOver
                    ? `最多 ${caps.tags.maxCount} 个`
                    : null
                }
              >
                <TagInput
                  value={values.tags}
                  onChange={(tags) => {
                    change('tags', { tags });
                  }}
                />
              </BulkRow>
            ) : null}

            {visibilityItems.length > 0 ? (
              <BulkRow
                id="bulk-visibility"
                label="谁可以看"
                on={enabled.has('visibility')}
                onToggle={(on) => {
                  toggle('visibility', on);
                }}
              >
                <Select
                  value={values.visibility}
                  items={visibilityItems}
                  onValueChange={(next) => {
                    change('visibility', {
                      visibility:
                        (next as ContentVisibility | null) ??
                        visibilityItems[0].value,
                    });
                  }}
                >
                  <SelectTrigger id="bulk-visibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibilityItems.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </BulkRow>
            ) : null}

            {caps.schedule ? (
              <BulkRow
                id="bulk-schedule"
                label="发布时间"
                description={`定时需在 ${caps.schedule.minHours} 小时后至 ${caps.schedule.maxDays} 天内`}
                on={enabled.has('schedule')}
                onToggle={(on) => {
                  toggle('schedule', on);
                }}
                error={enabled.has('schedule') ? scheduleError : null}
              >
                <RadioGroup
                  value={values.scheduleMode}
                  className="flex flex-wrap gap-x-6 gap-y-2"
                  onValueChange={(mode) => {
                    change('schedule', {
                      scheduleMode: mode as BulkValues['scheduleMode'],
                    });
                  }}
                >
                  <Field orientation="horizontal" className="w-auto">
                    <RadioGroupItem value="now" id="bulk-schedule-now" />
                    <FieldLabel
                      htmlFor="bulk-schedule-now"
                      className="font-normal"
                    >
                      立即发布
                    </FieldLabel>
                  </Field>
                  <Field orientation="horizontal" className="w-auto">
                    <RadioGroupItem value="scheduled" id="bulk-schedule-at" />
                    <FieldLabel
                      htmlFor="bulk-schedule-at"
                      className="font-normal"
                    >
                      定时发布
                    </FieldLabel>
                  </Field>
                </RadioGroup>
                {values.scheduleMode === 'scheduled' ? (
                  <DateTimePicker
                    id="bulk-schedule"
                    minHours={caps.schedule.minHours}
                    maxDays={caps.schedule.maxDays}
                    value={values.scheduledLocal}
                    onChange={(scheduledLocal) => {
                      change('schedule', { scheduledLocal });
                    }}
                  />
                ) : null}
              </BulkRow>
            ) : null}

            {caps.location ? (
              <BulkRow
                id="bulk-location"
                label="地点"
                on={enabled.has('location')}
                onToggle={(on) => {
                  toggle('location', on);
                }}
              >
                <Input
                  id="bulk-location"
                  value={values.location}
                  placeholder="留空则清除"
                  onChange={(e) => {
                    change('location', { location: e.target.value });
                  }}
                />
              </BulkRow>
            ) : null}

            {caps.partition ? (
              <BulkRow
                id="bulk-partition"
                label={caps.partition.label}
                on={enabled.has('partition')}
                onToggle={(on) => {
                  toggle('partition', on);
                }}
              >
                <Input
                  id="bulk-partition"
                  value={values.partition}
                  placeholder="留空则清除"
                  onChange={(e) => {
                    change('partition', { partition: e.target.value });
                  }}
                />
              </BulkRow>
            ) : null}
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={enabled.size === 0 || invalid}
            onClick={apply}
          >
            {enabled.size > 0 ? `应用 ${enabled.size} 项` : '应用'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 一行批量字段：左侧勾选决定是否写入，右侧是取值控件 */
function BulkRow({
  id,
  label,
  description,
  on,
  onToggle,
  error,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  error?: string | null;
  children: ReactNode;
}) {
  const checkboxId = `${id}-apply`;
  return (
    <Field orientation="horizontal" data-invalid={error ? true : undefined}>
      <Checkbox
        id={checkboxId}
        checked={on}
        aria-label={`修改${label}`}
        onCheckedChange={(checked) => {
          onToggle(checked);
        }}
      />
      <FieldContent className="gap-2">
        <FieldLabel htmlFor={checkboxId}>{label}</FieldLabel>
        {children}
        {error ? (
          <FieldError>{error}</FieldError>
        ) : description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
    </Field>
  );
}
