import type { RefObject } from 'react';
import { DateTimePicker } from '@/components/DateTimePicker';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type { PlatformAccountItem } from '@/lib/api';
import { CharCountInput, CharCountTextarea } from './CharCountFields';
import { CoverHoverCard } from './CoverHoverCard';
import { TagInput } from './TagInput';
import {
  BODY_MAX,
  TITLE_MAX,
  VISIBILITY_OPTIONS,
  parseTags,
  truncateCommonReference,
  type CoverKind,
  type OverrideDraft,
} from './helpers';

/** 覆盖区展示通用默认值，避免用户来回对照上方 Card */
function CommonReferenceHint({ label, value }: { label: string; value: string }) {
  const text = truncateCommonReference(value);
  if (!text) {
    return null;
  }
  return (
    <p className="text-xs text-muted-foreground">
      通用{label}：{text}
    </p>
  );
}

/** 通用文案：仅标题与描述，作为各账号默认值 */
export function ContentInfoForm({
  title,
  setTitle,
  body,
  setBody,
  titleInputRef,
  disabled,
}: {
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
}) {
  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor="video-title">标题</FieldLabel>
        <CharCountInput
          id="video-title"
          ref={titleInputRef}
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
        <FieldLabel htmlFor="video-body">作品描述</FieldLabel>
        <CharCountTextarea
          id="video-body"
          placeholder="添加作品描述（可选）"
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
  commonCoverReady,
  commonCoverLandscapeReady,
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
  const scheduleEnabled = Boolean(draft.scheduledLocal.trim());

  const patch = (partial: Partial<OverrideDraft>) => {
    onDraftChange({ ...draft, ...partial });
  };

  const tags = parseTags(draft.tagsText);

  const accountCoverReady =
    Boolean(draft.coverBlob) || draft.hasCover || Boolean(draft.coverPreviewUrl.trim());
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
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">发布选项</p>
        <p className="text-xs text-muted-foreground">以下设置按账号独立配置，不继承通用区</p>
      </div>

      <Field>
        <FieldLabel>话题</FieldLabel>
        <TagInput
          value={tags}
          disabled={disabled}
          onChange={(next) => {
            patch({ tagsText: next.join(' ') });
          }}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`ov-${account.id}-visibility`}>可见性</FieldLabel>
        <Select
          value={draft.visibility}
          disabled={disabled}
          items={VISIBILITY_OPTIONS}
          onValueChange={(value) => {
            patch({ visibility: (value as OverrideDraft['visibility'] | null) ?? 'public' });
          }}
        >
          <SelectTrigger id={`ov-${account.id}-visibility`} className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={`ov-${account.id}-schedule-enabled`} className="text-sm font-medium">
              定时发布
            </Label>
            <FieldDescription>2 小时至 14 天内；留空则立即发布</FieldDescription>
          </div>
          <Switch
            id={`ov-${account.id}-schedule-enabled`}
            checked={scheduleEnabled}
            disabled={disabled}
            onCheckedChange={(checked) => {
              patch({ scheduledLocal: checked ? draft.scheduledLocal || '' : '' });
            }}
          />
        </div>
        {scheduleEnabled ? (
          <div className="mt-3">
            <FieldLabel htmlFor={`ov-${account.id}-schedule`}>发布时间</FieldLabel>
            <DateTimePicker
              id={`ov-${account.id}-schedule`}
              disabled={disabled}
              value={draft.scheduledLocal}
              onChange={(value) => {
                patch({ scheduledLocal: value });
              }}
            />
          </div>
        ) : null}
      </Field>

      <Field>
        <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={`ov-${account.id}-allow-download`} className="text-sm font-medium">
              允许下载
            </Label>
            <FieldDescription>是否允许观众下载该视频</FieldDescription>
          </div>
          <Switch
            id={`ov-${account.id}-allow-download`}
            checked={draft.allowDownload}
            disabled={disabled}
            onCheckedChange={(checked) => {
              patch({ allowDownload: checked });
            }}
          />
        </div>
      </Field>

      <Separator />

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">覆盖通用（可选）</p>
        <p className="text-xs text-muted-foreground">
          留空则使用上方通用标题、描述与封面；封面按账号独立，不共享给其它账号
        </p>
      </div>

      <Field>
        <FieldLabel htmlFor={`ov-${account.id}-title`}>标题</FieldLabel>
        {!draft.title.trim() ? <CommonReferenceHint label="标题" value={commonTitle} /> : null}
        <CharCountInput
          id={`ov-${account.id}-title`}
          placeholder="使用通用标题"
          max={TITLE_MAX}
          disabled={disabled}
          value={draft.title}
          onChange={(e) => {
            patch({ title: e.target.value });
          }}
        />
      </Field>

      <Field>
        <FieldLabel>封面</FieldLabel>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          <CoverHoverCard
            label="竖版 3:4"
            ready={accountCoverReady || commonCoverReady}
            src={portraitSrc}
            objectFit="contain"
            aspectRatio={3 / 4}
            previewClassName="h-24 shrink-0"
            disabled={disabled || coverDisabled}
            onEdit={() => {
              onEditCover('cover');
            }}
          />
          {!portraitOnly ? (
            <CoverHoverCard
              label="横版 4:3"
              ready={accountLandscapeReady || commonCoverLandscapeReady}
              src={landscapeSrc}
              aspectRatio={4 / 3}
              previewClassName="h-24 shrink-0"
              disabled={disabled || coverDisabled}
              onEdit={() => {
                onEditCover('cover_landscape');
              }}
            />
          ) : null}
        </div>
        {!accountCoverReady && (portraitOnly || !accountLandscapeReady) ? (
          <p className="mt-2 text-xs text-muted-foreground">当前使用通用封面；点击槽位可为该账号单独设置</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">已覆盖该账号封面；重置账号可清除本地覆盖（已上传的需重新编辑）</p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor={`ov-${account.id}-body`}>作品描述</FieldLabel>
        {!draft.body.trim() ? <CommonReferenceHint label="描述" value={commonBody} /> : null}
        <CharCountTextarea
          id={`ov-${account.id}-body`}
          placeholder="使用通用描述"
          max={BODY_MAX}
          className="min-h-16"
          disabled={disabled}
          value={draft.body}
          onChange={(e) => {
            patch({ body: e.target.value });
          }}
        />
      </Field>
    </FieldGroup>
  );
}
