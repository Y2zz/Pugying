import type { ContentTargetOverrides, ContentVisibility, PlatformAccountItem } from '@/lib/api';

export const TITLE_MAX = 30;
export const BODY_MAX = 1000;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const WARN_DURATION_SEC = 15 * 60;

export type CoverKind = 'cover' | 'cover_landscape';
/** busy 细分：底栏按钮与取消上传依赖阶段，避免一律「处理中」 */
export type BusyPhase = 'idle' | 'uploading' | 'saving' | 'publishing';
export type PublishStep = 1 | 2;
/** 右栏聚焦通用设置时的哨兵值；其它值为平台账号 id */
export const RULE_FOCUS_COMMON = 'common';
export type RuleFocus = string;

export const VISIBILITY_OPTIONS: { value: ContentVisibility; label: string }[] = [
  { value: 'public', label: '公开' },
  { value: 'friends', label: '好友可见' },
  { value: 'private', label: '仅自己可见' },
];

export const ACCOUNT_STATUS_TEXT: Record<PlatformAccountItem['status'], string> = {
  active: '正常',
  expired: '已过期',
  revoked: '已失效',
};

export const OVERRIDE_FIELD_LABELS: [keyof ContentTargetOverrides, string][] = [
  ['title', '标题'],
  ['body', '描述'],
  ['coverUrl', '封面'],
  ['tags', '话题'],
  ['scheduledAt', '定时'],
];

export interface OverrideDraft {
  title: string;
  body: string;
  coverUrl: string;
  tagsText: string;
  scheduledLocal: string;
}

export function emptyDraft(): OverrideDraft {
  return { title: '', body: '', coverUrl: '', tagsText: '', scheduledLocal: '' };
}

/** ISO → 日期时间选择器使用的本地时间字符串 */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(value: string): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** 抖音定时规则：2 小时后至 14 天内 */
export function validateSchedule(iso: string): string | null {
  const time = new Date(iso).getTime();
  const now = Date.now();
  if (time < now + 2 * 60 * 60 * 1000) {
    return '定时发布需至少在 2 小时之后（参考抖音规则）';
  }
  if (time > now + 14 * 24 * 60 * 60 * 1000) {
    return '定时发布不能超过 14 天（参考抖音规则）';
  }
  return null;
}

export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,，#]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    ),
  ];
}

export function overrideCount(overrides: ContentTargetOverrides | undefined): number {
  return overrides ? Object.keys(overrides).length : 0;
}

export function overridesToDraft(o: ContentTargetOverrides | undefined): OverrideDraft {
  return {
    title: o?.title ?? '',
    body: o?.body ?? '',
    coverUrl: o?.coverUrl ?? '',
    tagsText: o?.tags?.join(' ') ?? '',
    scheduledLocal: isoToLocalInput(o?.scheduledAt),
  };
}

export function draftToOverrides(draft: OverrideDraft): ContentTargetOverrides {
  const result: ContentTargetOverrides = {};
  if (draft.title.trim()) {
    result.title = draft.title.trim();
  }
  if (draft.body.trim()) {
    result.body = draft.body.trim();
  }
  if (draft.coverUrl.trim()) {
    result.coverUrl = draft.coverUrl.trim();
  }
  const tags = parseTags(draft.tagsText);
  if (tags.length > 0) {
    result.tags = tags;
  }
  const iso = localInputToIso(draft.scheduledLocal);
  if (iso) {
    result.scheduledAt = iso;
  }
  return result;
}

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
