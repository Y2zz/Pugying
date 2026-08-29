import type { RefObject } from 'react';
import { MapPin } from 'lucide-react';
import { DateTimePicker } from '@/components/DateTimePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ContentVisibility, PlatformAccountItem } from '@/lib/api';
import { CoverHoverCard } from './CoverHoverCard';
import { TagInput } from './TagInput';
import {
  BODY_MAX,
  OVERRIDE_FIELD_LABELS,
  TITLE_MAX,
  VISIBILITY_OPTIONS,
  draftToOverrides,
  emptyDraft,
  overrideCount,
  type CoverKind,
  type OverrideDraft,
} from './helpers';

export function CommonRuleForm({
  title,
  setTitle,
  body,
  setBody,
  location,
  setLocation,
  tags,
  setTags,
  visibility,
  setVisibility,
  scheduleEnabled,
  setScheduleEnabled,
  scheduledLocal,
  setScheduledLocal,
  allowDownload,
  setAllowDownload,
  coverUrl,
  coverLandscapeUrl,
  coverPreviewUrl,
  coverLandscapePreviewUrl,
  coverHint,
  coverSectionRef,
  titleInputRef,
  scheduleInputRef,
  disabled,
  onCropCover,
  onReplaceCover,
}: {
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  tags: string[];
  setTags: (v: string[]) => void;
  visibility: ContentVisibility;
  setVisibility: (v: ContentVisibility) => void;
  scheduleEnabled: boolean;
  setScheduleEnabled: (v: boolean) => void;
  scheduledLocal: string;
  setScheduledLocal: (v: string) => void;
  allowDownload: boolean;
  setAllowDownload: (v: boolean) => void;
  coverUrl: string;
  coverLandscapeUrl: string;
  coverPreviewUrl: string | null;
  coverLandscapePreviewUrl: string | null;
  coverHint: string;
  coverSectionRef: RefObject<HTMLDivElement | null>;
  titleInputRef: RefObject<HTMLInputElement | null>;
  scheduleInputRef: RefObject<HTMLButtonElement | null>;
  disabled: boolean;
  onCropCover: (kind: CoverKind) => void;
  onReplaceCover: (file: File, kind: CoverKind) => void;
}) {
  return (
    <FieldGroup className="gap-4">
      <Field ref={coverSectionRef}>
        <FieldLabel>封面</FieldLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <CoverHoverCard
            label="竖版 3:4"
            ready={Boolean(coverUrl)}
            src={coverPreviewUrl || coverUrl}
            objectFit="contain"
            previewClassName="h-40 max-h-40 w-full"
            disabled={disabled}
            onCrop={() => {
              onCropCover('cover');
            }}
            onReplace={(file) => {
              onReplaceCover(file, 'cover');
            }}
          />
          <CoverHoverCard
            label="横版 16:9"
            ready={Boolean(coverLandscapeUrl)}
            src={coverLandscapePreviewUrl || coverLandscapeUrl}
            aspectRatio={16 / 9}
            previewClassName="w-full"
            disabled={disabled}
            onCrop={() => {
              onCropCover('cover_landscape');
            }}
            onReplace={(file) => {
              onReplaceCover(file, 'cover_landscape');
            }}
          />
        </div>
        <FieldDescription>{coverHint}</FieldDescription>
      </Field>

      <Field>
        <div className="flex items-baseline justify-between">
          <FieldLabel htmlFor="video-title">标题</FieldLabel>
          <span className="text-xs text-muted-foreground">
            {title.length}/{TITLE_MAX}
          </span>
        </div>
        <Input
          id="video-title"
          ref={titleInputRef}
          placeholder="填写作品标题"
          maxLength={TITLE_MAX}
          disabled={disabled}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </Field>

      <Field>
        <div className="flex items-baseline justify-between">
          <FieldLabel htmlFor="video-body">作品描述</FieldLabel>
          <span className="text-xs text-muted-foreground">
            {body.length}/{BODY_MAX}
          </span>
        </div>
        <Textarea
          id="video-body"
          placeholder="添加作品描述（可选）"
          className="min-h-24"
          maxLength={BODY_MAX}
          disabled={disabled}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
          }}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="video-location" className="flex items-center gap-1">
          <MapPin />
          位置
        </FieldLabel>
        <Input
          id="video-location"
          placeholder="添加位置信息（可选）"
          maxLength={100}
          disabled={disabled}
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
          }}
        />
      </Field>

      <Field>
        <FieldLabel>话题</FieldLabel>
        <TagInput value={tags} onChange={setTags} disabled={disabled} />
      </Field>

      <Field>
        <FieldLabel>谁可以看</FieldLabel>
        <Select
          value={visibility}
          onValueChange={(value) => {
            setVisibility((value as ContentVisibility) ?? 'public');
          }}
          items={VISIBILITY_OPTIONS}
        >
          <SelectTrigger className="w-full" disabled={disabled}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {VISIBILITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <div className="flex items-center justify-between gap-4">
          <FieldContent>
            <FieldLabel htmlFor="video-schedule">定时发布</FieldLabel>
            <FieldDescription>2 小时后至 14 天内</FieldDescription>
          </FieldContent>
          <Switch
            id="video-schedule"
            disabled={disabled}
            checked={scheduleEnabled}
            onCheckedChange={(checked) => {
              setScheduleEnabled(checked === true);
            }}
          />
        </div>
        {scheduleEnabled ? (
          <DateTimePicker
            ref={scheduleInputRef}
            disabled={disabled}
            value={scheduledLocal}
            onChange={(value) => {
              setScheduledLocal(value);
            }}
          />
        ) : null}
      </Field>

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="video-allow-download">允许他人保存视频</FieldLabel>
        </FieldContent>
        <Switch
          id="video-allow-download"
          disabled={disabled}
          checked={allowDownload}
          onCheckedChange={(checked) => {
            setAllowDownload(checked === true);
          }}
        />
      </Field>
    </FieldGroup>
  );
}

/** 单个账号差异规则：留空字段继承通用设置 */
export function AccountOverrideForm({
  account,
  platformLabel,
  draft,
  onDraftChange,
  disabled,
  onBackToCommon,
}: {
  account: PlatformAccountItem;
  platformLabel: string;
  draft: OverrideDraft;
  onDraftChange: (draft: OverrideDraft) => void;
  disabled?: boolean;
  onBackToCommon: () => void;
}) {
  const active = draftToOverrides(draft);
  const count = overrideCount(active);
  const overriddenLabels = OVERRIDE_FIELD_LABELS.filter(([key]) => active[key] !== undefined).map(([, label]) => label);

  const patch = (partial: Partial<OverrideDraft>) => {
    onDraftChange({ ...draft, ...partial });
  };

  return (
    <FieldGroup className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <Badge variant="outline" className="mr-2">
              {platformLabel}
            </Badge>
            {account.displayName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {count > 0 ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                已覆盖：
                {overriddenLabels.map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                  </Badge>
                ))}
              </span>
            ) : (
              '当前使用通用设置；填写下方字段可覆盖'
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || count === 0}
            onClick={() => {
              onDraftChange(emptyDraft());
            }}
          >
            清空差异
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onBackToCommon}>
            返回通用
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <div className="flex items-baseline justify-between">
            <FieldLabel htmlFor={`ov-${account.id}-title`}>标题</FieldLabel>
            <span className="text-xs text-muted-foreground">
              {draft.title.length}/{TITLE_MAX}
            </span>
          </div>
          <Input
            id={`ov-${account.id}-title`}
            placeholder="使用通用标题"
            maxLength={TITLE_MAX}
            disabled={disabled}
            value={draft.title}
            onChange={(e) => {
              patch({ title: e.target.value });
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`ov-${account.id}-cover`}>封面图 URL</FieldLabel>
          <Input
            id={`ov-${account.id}-cover`}
            placeholder="使用通用封面"
            disabled={disabled}
            value={draft.coverUrl}
            onChange={(e) => {
              patch({ coverUrl: e.target.value });
            }}
          />
        </Field>
      </div>

      <Field>
        <div className="flex items-baseline justify-between">
          <FieldLabel htmlFor={`ov-${account.id}-body`}>作品描述</FieldLabel>
          <span className="text-xs text-muted-foreground">
            {draft.body.length}/{BODY_MAX}
          </span>
        </div>
        <Textarea
          id={`ov-${account.id}-body`}
          placeholder="使用通用描述"
          className="min-h-16"
          maxLength={BODY_MAX}
          disabled={disabled}
          value={draft.body}
          onChange={(e) => {
            patch({ body: e.target.value });
          }}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`ov-${account.id}-tags`}>话题（空格/逗号分隔）</FieldLabel>
          <Input
            id={`ov-${account.id}-tags`}
            placeholder="使用通用话题"
            disabled={disabled}
            value={draft.tagsText}
            onChange={(e) => {
              patch({ tagsText: e.target.value });
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`ov-${account.id}-schedule`}>定时发布时间</FieldLabel>
          <DateTimePicker
            id={`ov-${account.id}-schedule`}
            disabled={disabled}
            value={draft.scheduledLocal}
            onChange={(value) => {
              patch({ scheduledLocal: value });
            }}
          />
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">留空的字段使用通用设置；定时同样需满足 2 小时至 14 天规则</p>
    </FieldGroup>
  );
}
