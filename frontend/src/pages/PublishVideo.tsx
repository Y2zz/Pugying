import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Crop,
  Hash,
  ImagePlus,
  Link2,
  MapPin,
  Save,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CoverCropDialog,
  type CoverAspect,
} from '@/components/CoverCropDialog';
import { MediaPreviewImage } from '@/components/MediaPreviewImage';
import { useAgent } from '@/hooks/use-agent';
import { agentClient } from '@/lib/agent-client';
import {
  checkMediaDuplicate,
  createContent,
  completeContentTarget,
  fetchContent,
  fetchMediaSignedUrl,
  fetchPlatformAccounts,
  fetchPlatformCatalog,
  parseMediaAssetId,
  publishContent,
  startContentTarget,
  updateContent,
  uploadMediaFile,
  type ContentStatus,
  type ContentTargetInput,
  type ContentTargetOverrides,
  type ContentVisibility,
  type MediaDuplicateHit,
  type PlatformAccountItem,
  type PlatformCatalogItem,
} from '@/lib/api';
import { sha256File } from '@/lib/file-hash';
import {
  describeCaughtError,
  describePublishError,
  describePublishPhase,
} from '@/lib/publish-errors';
import { extractCoverPairFromVideoFile } from '@/lib/video-cover';

type CoverKind = 'cover' | 'cover_landscape';
/** busy 细分：底栏按钮与取消上传依赖阶段，避免一律「处理中」 */
type BusyPhase = 'idle' | 'uploading' | 'saving' | 'publishing';

const TITLE_MAX = 30;
const BODY_MAX = 1000;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const WARN_DURATION_SEC = 15 * 60;

const VISIBILITY_OPTIONS: { value: ContentVisibility; label: string }[] = [
  { value: 'public', label: '公开' },
  { value: 'friends', label: '好友可见' },
  { value: 'private', label: '仅自己可见' },
];

const ACCOUNT_STATUS_TEXT: Record<PlatformAccountItem['status'], string> = {
  active: '正常',
  expired: '已过期',
  revoked: '已失效',
};

/** ISO → <input type="datetime-local"> 值（本地时区） */
function isoToLocalInput(iso: string | null | undefined): string {
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

function localInputToIso(value: string): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** 抖音定时规则：2 小时后至 14 天内 */
function validateSchedule(iso: string): string | null {
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

function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,，#]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    ),
  ];
}

function overrideCount(overrides: ContentTargetOverrides | undefined): number {
  return overrides ? Object.keys(overrides).length : 0;
}

/** 话题输入：回车/空格分词，Badge 展示，可删除 */
function TagInput({ value, onChange, disabled }: { value: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const parsed = parseTags(draft);
    if (parsed.length > 0) {
      onChange([...new Set([...value, ...parsed])]);
    }
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          placeholder="输入话题后回车，如：美食 vlog"
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </div>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              <Hash className="size-3" />
              {tag}
              {!disabled ? (
                <button
                  type="button"
                  className="ml-0.5 rounded-sm opacity-60 hover:opacity-100"
                  onClick={() => {
                    onChange(value.filter((t) => t !== tag));
                  }}
                >
                  <X />
                  <span className="sr-only">移除 {tag}</span>
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface OverrideDraft {
  title: string;
  body: string;
  coverUrl: string;
  tagsText: string;
  scheduledLocal: string;
}

function emptyDraft(): OverrideDraft {
  return { title: '', body: '', coverUrl: '', tagsText: '', scheduledLocal: '' };
}

function overridesToDraft(o: ContentTargetOverrides | undefined): OverrideDraft {
  return {
    title: o?.title ?? '',
    body: o?.body ?? '',
    coverUrl: o?.coverUrl ?? '',
    tagsText: o?.tags?.join(' ') ?? '',
    scheduledLocal: isoToLocalInput(o?.scheduledAt),
  };
}

function draftToOverrides(draft: OverrideDraft): ContentTargetOverrides {
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

const OVERRIDE_FIELD_LABELS: [keyof ContentTargetOverrides, string][] = [
  ['title', '标题'],
  ['body', '描述'],
  ['coverUrl', '封面'],
  ['tags', '话题'],
  ['scheduledAt', '定时'],
];

/** 单个账号的差异设置卡片（可折叠，内联编辑） */
function OverrideCard({
  account,
  platformLabel,
  draft,
  onDraftChange,
  disabled,
}: {
  account: PlatformAccountItem;
  platformLabel: string;
  draft: OverrideDraft;
  onDraftChange: (draft: OverrideDraft) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = draftToOverrides(draft);
  const count = overrideCount(active);
  const overriddenLabels = OVERRIDE_FIELD_LABELS.filter(([key]) => active[key] !== undefined).map(([, label]) => label);

  const patch = (partial: Partial<OverrideDraft>) => {
    onDraftChange({ ...draft, ...partial });
  };

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <Badge variant="outline">{platformLabel}</Badge>
        <span className="flex-1 truncate text-sm font-medium">{account.displayName}</span>
        {count > 0 ? (
          <span className="flex items-center gap-1">
            {overriddenLabels.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">使用通用设置</span>
        )}
        <ChevronDown className={cn('shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open ? (
        <CardContent className="border-t px-4 py-4">
          <FieldGroup className="gap-4">
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
                <Input
                  id={`ov-${account.id}-schedule`}
                  type="datetime-local"
                  disabled={disabled}
                  value={draft.scheduledLocal}
                  onChange={(e) => {
                    patch({ scheduledLocal: e.target.value });
                  }}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">留空的字段使用通用设置；定时同样需满足 2 小时至 14 天规则</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || count === 0}
                onClick={() => {
                  onDraftChange(emptyDraft());
                }}
              >
                清空差异
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function PublishVideo() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const { connected, publishBusy, canPublish, status: agentStatus } = useAgent();

  // 基础字段
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFileName, setVideoFileName] = useState('');
  const [videoFileSize, setVideoFileSize] = useState<number | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [coverLandscapeUrl, setCoverLandscapeUrl] = useState('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverLandscapePreviewUrl, setCoverLandscapePreviewUrl] = useState<
    string | null
  >(null);
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [uploadHint, setUploadHint] = useState('');
  const [publishHint, setPublishHint] = useState('');
  const [cropOpen, setCropOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState<CoverAspect>('3:4');
  // 发布设置
  const [visibility, setVisibility] = useState<ContentVisibility>('public');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  // 分发目标（P0 仅抖音）
  const [accounts, setAccounts] = useState<PlatformAccountItem[]>([]);
  const [catalog, setCatalog] = useState<PlatformCatalogItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, OverrideDraft>>({});

  const [busy, setBusy] = useState(false);
  const [busyPhase, setBusyPhase] = useState<BusyPhase>('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateHit, setDuplicateHit] = useState<MediaDuplicateHit | null>(
    null,
  );
  const pendingVideoRef = useRef<File | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const coverSectionRef = useRef<HTMLDivElement>(null);
  const accountsSectionRef = useRef<HTMLDivElement>(null);
  const scheduleInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  // 新建保存后的内容 id（可先于 URL ?id=），避免部分失败后再次「存草稿」重复创建
  const [ownedContentId, setOwnedContentId] = useState<string | null>(editId);

  useEffect(() => {
    setOwnedContentId(editId);
  }, [editId]);

  const revokePreview = (url: string | null | undefined) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  /** 更换视频时先清封面，避免失败后仍展示上一支视频的封面造成「已就绪」错觉 */
  const clearCoverState = () => {
    setCoverPreviewUrl((prev) => {
      revokePreview(prev);
      return null;
    });
    setCoverLandscapePreviewUrl((prev) => {
      revokePreview(prev);
      return null;
    });
    setCoverUrl('');
    setCoverLandscapeUrl('');
  };

  const beginBusy = (phase: BusyPhase) => {
    setBusy(true);
    setBusyPhase(phase);
  };

  const endBusy = () => {
    setBusy(false);
    setBusyPhase('idle');
    uploadAbortRef.current = null;
  };

  const cancelUpload = () => {
    uploadAbortRef.current?.abort();
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [platforms, accountList] = await Promise.all([
          fetchPlatformCatalog(),
          fetchPlatformAccounts(),
        ]);
        if (cancelled) {
          return;
        }
        setCatalog(platforms.filter((p) => p.id === 'douyin'));
        const douyinAccounts = accountList.filter((a) => a.platform === 'douyin');
        setAccounts(douyinAccounts);

        if (editId) {
          const item = await fetchContent(editId);
          if (cancelled) {
            return;
          }
          setTitle(item.title);
          setBody(item.body ?? '');
          setCoverUrl(item.coverUrl ?? '');
          setCoverLandscapeUrl(item.coverLandscapeUrl ?? '');
          setCoverPreviewUrl(item.coverUrl ?? null);
          setCoverLandscapePreviewUrl(item.coverLandscapeUrl ?? null);
          setVideoUrl(item.mediaUrls[0] ?? '');
          setVideoFileName(item.mediaUrls[0] ? '团队库视频' : '');
          setVideoFileSize(null);
          setTags(item.tags);
          setLocation(item.location ?? '');
          setVisibility(item.visibility);
          setScheduleEnabled(Boolean(item.scheduledAt));
          setScheduledLocal(isoToLocalInput(item.scheduledAt));
          setAllowDownload(item.allowDownload);
          const nextSelected: Record<string, boolean> = {};
          const nextDrafts: Record<string, OverrideDraft> = {};
          for (const target of item.targets) {
            if (target.platform !== 'douyin') {
              continue;
            }
            nextSelected[target.platformAccountId] = true;
            nextDrafts[target.platformAccountId] = overridesToDraft(
              target.overrides,
            );
          }
          setSelected(nextSelected);
          setDrafts(nextDrafts);
        } else {
          const active = douyinAccounts.filter((a) => a.status === 'active');
          if (active.length === 1) {
            setSelected({ [active[0].id]: true });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [editId]);
  const grouped = useMemo(() => {
    const byPlatform = new Map<string, PlatformAccountItem[]>();
    for (const account of accounts) {
      const list = byPlatform.get(account.platform) ?? [];
      list.push(account);
      byPlatform.set(account.platform, list);
    }
    const order = catalog.length > 0 ? catalog.map((c) => c.id) : [...byPlatform.keys()];
    return order
      .filter((id) => byPlatform.has(id))
      .map((id) => ({
        platform: id,
        displayName: catalog.find((c) => c.id === id)?.displayName ?? id,
        accounts: byPlatform.get(id)!,
      }));
  }, [accounts, catalog]);

  /** 已选账号（按平台分组顺序），用于差异设置卡片 */
  const selectedAccounts = useMemo(
    () =>
      grouped.flatMap((group) => group.accounts.filter((account) => selected[account.id]).map((account) => ({ account, platformLabel: group.displayName }))),
    [grouped, selected]
  );

  const getDraft = (accountId: string): OverrideDraft => drafts[accountId] ?? emptyDraft();

  const buildTargets = (): ContentTargetInput[] =>
    selectedAccounts.map(({ account }) => {
      const overrides = draftToOverrides(getDraft(account.id));
      return {
        platformAccountId: account.id,
        overrides: overrideCount(overrides) > 0 ? overrides : undefined,
      };
    });

  /** 校验失败时滚到第一个阻塞项，折叠里的定时需先展开 */
  const focusBlock = (
    kind:
      | 'video'
      | 'cover'
      | 'title'
      | 'accounts'
      | 'schedule'
      | 'agent',
  ) => {
    const scroll = (el: HTMLElement | null) => {
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    switch (kind) {
      case 'video':
        scroll(videoSectionRef.current);
        break;
      case 'cover':
        scroll(coverSectionRef.current);
        break;
      case 'title':
        scroll(titleInputRef.current);
        titleInputRef.current?.focus();
        break;
      case 'accounts':
        scroll(accountsSectionRef.current);
        break;
      case 'schedule':
        setMoreOpen(true);
        window.setTimeout(() => {
          scroll(scheduleInputRef.current);
          scheduleInputRef.current?.focus();
        }, 50);
        break;
      case 'agent':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      default:
        break;
    }
  };

  const submit = async (status: ContentStatus) => {
    if (!title.trim()) {
      setError('请填写标题');
      focusBlock('title');
      return;
    }
    if (!videoUrl.trim()) {
      setError('请先上传视频（MP4）到团队库');
      focusBlock('video');
      return;
    }
    if (status === 'published' && !coverUrl.trim()) {
      setError('发布前请准备竖版封面（3:4）');
      focusBlock('cover');
      return;
    }
    if (status === 'published' && !coverLandscapeUrl.trim()) {
      setError('发布抖音前请准备横版封面（16:9）');
      focusBlock('cover');
      return;
    }
    if (status === 'published' && selectedAccounts.length === 0) {
      setError('请至少选择一个抖音账号');
      focusBlock('accounts');
      return;
    }
    let scheduledIso = '';
    if (scheduleEnabled) {
      scheduledIso = localInputToIso(scheduledLocal);
      if (!scheduledIso) {
        setError('请选择定时发布时间');
        focusBlock('schedule');
        return;
      }
      const scheduleError = validateSchedule(scheduledIso);
      if (scheduleError) {
        setError(scheduleError);
        focusBlock('schedule');
        return;
      }
    }
    for (const { account } of selectedAccounts) {
      const iso = draftToOverrides(getDraft(account.id)).scheduledAt;
      if (iso) {
        const scheduleError = validateSchedule(iso);
        if (scheduleError) {
          setError(`「${account.displayName}」${scheduleError}`);
          setMoreOpen(true);
          return;
        }
      }
    }

    if (status === 'published') {
      agentClient.connect();
      if (agentClient.getStatus() !== 'connected') {
        setError('本机 Agent 未连接。请先启动桌面 Agent 后再发布。');
        focusBlock('agent');
        return;
      }
      if (!agentClient.getHello()?.capabilities.includes('platform.publish.start')) {
        setError('当前 Agent 不支持发布能力，请升级桌面 Agent');
        focusBlock('agent');
        return;
      }
    }

    beginBusy(status === 'published' ? 'publishing' : 'saving');
    setError('');
    setPublishHint(status === 'published' ? '' : '正在保存草稿…');
    const payload = {
      title: title.trim(),
      body: body.trim(),
      coverUrl: coverUrl.trim(),
      coverLandscapeUrl: coverLandscapeUrl.trim(),
      mediaUrls: videoUrl.trim() ? [videoUrl.trim()] : [],
      tags,
      location: location.trim(),
      visibility,
      scheduledAt: scheduleEnabled ? scheduledIso : '',
      allowDownload,
      targets: buildTargets(),
      status: 'draft' as ContentStatus,
    };
    let contentId = ownedContentId;
    try {
      if (contentId) {
        await updateContent(contentId, payload);
      } else {
        const created = await createContent({ type: 'video', ...payload });
        contentId = created.id;
        setOwnedContentId(created.id);
      }

      if (status !== 'published' || !contentId) {
        setPublishHint('草稿已保存');
        void navigate('/contents');
        return;
      }

      setPublishHint('正在向后端申请发布…');
      const started = await publishContent(contentId);
      const accountLabel = (accountId: string) =>
        accounts.find((a) => a.id === accountId)?.displayName ??
        `账号 ${accountId.slice(0, 8)}`;
      const labelForTarget = (targetId: string) => {
        const hit = started.dispatches.find((d) => d.targetId === targetId);
        return hit ? accountLabel(hit.accountId) : '抖音';
      };
      const unsub = agentClient.subscribePublishProgress((event) => {
        setPublishHint(
          `${labelForTarget(event.targetId)} · ${describePublishPhase(event.phase)}${event.message ? ` · ${event.message}` : ''}`,
        );
      });

      try {
        const outcomes: Array<{ ok: boolean; code?: string; message?: string }> =
          [];
        for (const dispatch of started.dispatches) {
          setPublishHint(`开始推送「${accountLabel(dispatch.accountId)}」…`);
          const { dispatch: live } = await startContentTarget(
            contentId,
            dispatch.targetId,
          );
          const result = await agentClient.startPublish({
            targetId: live.targetId,
            platform: live.platform,
            accountId: live.accountId,
            mediaUrl: live.mediaUrl,
            coverUrl: live.coverUrl,
            coverLandscapeUrl: live.coverLandscapeUrl,
            title: live.title,
            body: live.body,
            visibility: live.visibility,
            scheduledAt: live.scheduledAt,
            allowDownload: live.allowDownload,
            cookies: live.cookies,
          });
          await completeContentTarget(contentId, live.targetId, {
            ok: result.ok,
            errorCode: result.errorCode ?? result.error,
            errorMessage: result.error,
            platformPostId: result.platformPostId,
            platformUrl: result.platformUrl,
          });
          outcomes.push({
            ok: result.ok,
            code: result.errorCode ?? result.error,
            message: result.error,
          });
        }

        const failed = outcomes.filter((o) => !o.ok);
        if (failed.length === 0) {
          void navigate('/contents');
          return;
        }
        const first = failed[0];
        setError(
          failed.length === outcomes.length
            ? describePublishError(first.code, first.message)
            : `部分成功（${outcomes.length - failed.length}/${outcomes.length}）。${describePublishError(first.code, first.message)} 可在内容列表重试失败账号。`,
        );
        // 发布已落库后再同步 URL，避免中途 replace 触发整页重载打断进度
        if (!editId && contentId) {
          void navigate(`/publish/video?id=${contentId}`, { replace: true });
        }
        endBusy();
        setPublishHint('');
        return;
      } finally {
        unsub();
      }
    } catch (err) {
      setError(describeCaughtError(err, '保存失败'));
      if (!editId && contentId) {
        void navigate(`/publish/video?id=${contentId}`, { replace: true });
      }
      endBusy();
      setPublishHint('');
    }
  };

  const ingestVideoFile = async (
    file: File,
    mode: 'upload' | 'reuse',
    existing?: { url: string; originalName?: string },
  ) => {
    setError('');
    const abort = new AbortController();
    uploadAbortRef.current = abort;
    beginBusy('uploading');
    setUploadHint(
      mode === 'reuse' ? '使用团队库已有视频…' : '上传视频中…',
    );
    try {
      const objectUrl = URL.createObjectURL(file);
      const durationSec = await new Promise<number>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          resolve(Number.isFinite(video.duration) ? video.duration : 0);
          URL.revokeObjectURL(objectUrl);
        };
        video.onerror = () => {
          resolve(0);
          URL.revokeObjectURL(objectUrl);
        };
        video.src = objectUrl;
      });
      if (abort.signal.aborted) {
        throw new DOMException('上传已取消', 'AbortError');
      }
      if (durationSec > WARN_DURATION_SEC) {
        setUploadHint(
          `时长约 ${Math.round(durationSec / 60)} 分钟（超过 15 分钟仅警告，仍可继续）`,
        );
      }

      let videoAssetUrl = existing?.url?.trim() ?? '';
      let videoLabel =
        existing?.originalName?.trim() || file.name;
      if (mode === 'upload') {
        const asset = await uploadMediaFile(
          file,
          'video',
          (ratio) => {
            setUploadHint(`上传视频 ${(ratio * 100).toFixed(0)}%`);
          },
          abort.signal,
        );
        videoAssetUrl = asset.url;
        videoLabel = asset.originalName;
      } else if (!videoAssetUrl) {
        throw new Error('缺少可复用的视频资源');
      }
      setVideoUrl(videoAssetUrl);
      setVideoFileName(videoLabel);
      setVideoFileSize(file.size);
      // 视频已切换后再清旧封面，取消上传时可保留更换前的封面
      clearCoverState();

      setUploadHint('正在从视频提取竖版与横版封面…');
      try {
        const { portrait, landscape } = await extractCoverPairFromVideoFile(file);
        if (abort.signal.aborted) {
          throw new DOMException('上传已取消', 'AbortError');
        }
        const baseName = file.name.replace(/\.[^.]+$/, '');

        const portraitPreview = URL.createObjectURL(portrait);
        setCoverPreviewUrl((prev) => {
          revokePreview(prev);
          return portraitPreview;
        });
        const landscapePreview = URL.createObjectURL(landscape);
        setCoverLandscapePreviewUrl((prev) => {
          revokePreview(prev);
          return landscapePreview;
        });

        setUploadHint('上传竖版封面…');
        const coverAsset = await uploadMediaFile(
          new File([portrait], `${baseName}-cover-3x4.jpg`, {
            type: 'image/jpeg',
          }),
          'cover',
          (ratio) => {
            setUploadHint(`上传竖封面 ${(ratio * 100).toFixed(0)}%`);
          },
          abort.signal,
        );
        setCoverUrl(coverAsset.url);

        setUploadHint('上传横版封面…');
        const landscapeAsset = await uploadMediaFile(
          new File([landscape], `${baseName}-cover-16x9.jpg`, {
            type: 'image/jpeg',
          }),
          'cover_landscape',
          (ratio) => {
            setUploadHint(`上传横封面 ${(ratio * 100).toFixed(0)}%`);
          },
          abort.signal,
        );
        setCoverLandscapeUrl(landscapeAsset.url);
        setUploadHint(
          mode === 'reuse'
            ? `已复用团队库视频，并重新生成封面（来源：${videoLabel}）`
            : '视频与竖/横封面已入库（封面来自视频截帧，可分别换本地图重裁）',
        );
      } catch (coverErr) {
        if (
          coverErr instanceof DOMException &&
          coverErr.name === 'AbortError'
        ) {
          throw coverErr;
        }
        setUploadHint(
          mode === 'reuse'
            ? `已复用团队库视频；自动提取封面失败，请本地选图并裁剪`
            : `视频已入库：${videoLabel}；自动提取封面失败，请本地选图并裁剪`,
        );
        setError(
          coverErr instanceof Error
            ? `自动提取封面失败：${coverErr.message}`
            : '自动提取封面失败，请本地选图并裁剪',
        );
      }
    } catch (err) {
      const cancelled =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.message === '上传已取消');
      if (cancelled) {
        setUploadHint('已取消上传');
        setError('');
      } else {
        setError(describeCaughtError(err, '视频处理失败'));
        setUploadHint('');
      }
    } finally {
      endBusy();
      pendingVideoRef.current = null;
    }
  };

  const onPickVideo = async (file: File | null) => {
    if (!file) {
      return;
    }
    if (!file.type.includes('mp4') && !file.name.toLowerCase().endsWith('.mp4')) {
      setError('仅支持 MP4（H.264+AAC）视频');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError('视频超过 1GB 上限');
      return;
    }
    setError('');
    const abort = new AbortController();
    uploadAbortRef.current = abort;
    beginBusy('uploading');
    setUploadHint('正在校验是否重复…');
    try {
      const checksum = await sha256File(file, (ratio) => {
        if (abort.signal.aborted) {
          return;
        }
        setUploadHint(`正在校验是否重复 ${(ratio * 100).toFixed(0)}%`);
      });
      if (abort.signal.aborted) {
        throw new DOMException('上传已取消', 'AbortError');
      }
      const { duplicate } = await checkMediaDuplicate({
        kind: 'video',
        checksumSha256: checksum,
      });
      if (duplicate) {
        pendingVideoRef.current = file;
        setDuplicateHit(duplicate);
        setDuplicateOpen(true);
        endBusy();
        setUploadHint('');
        return;
      }
      await ingestVideoFile(file, 'upload');
    } catch (err) {
      const cancelled =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.message === '上传已取消');
      if (cancelled) {
        setUploadHint('已取消上传');
        setError('');
      } else {
        setError(describeCaughtError(err, '视频校验失败'));
        setUploadHint('');
      }
      endBusy();
    }
  };

  const formatBytes = (size: number): string => {
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
  };

  const onPickCover = (
    file: File | null,
    kind: CoverKind,
  ) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('封面请选择图片文件');
      return;
    }
    setError('');
    setCropSourceUrl(null);
    setCropAspect(kind === 'cover' ? '3:4' : '16:9');
    setCropFile(file);
    setCropOpen(true);
  };

  const onCropExistingCover = async (kind: CoverKind) => {
    const ref =
      kind === 'cover'
        ? coverPreviewUrl || coverUrl
        : coverLandscapePreviewUrl || coverLandscapeUrl;
    if (!ref?.trim()) {
      setError('暂无可裁剪的封面，请先上传视频或替换本地图');
      return;
    }
    setError('');
    beginBusy('uploading');
    try {
      const url = await resolveCoverDisplayUrl(ref);
      setCropFile(null);
      setCropSourceUrl((prev) => {
        if (prev?.startsWith('blob:') && prev !== ref.trim()) {
          URL.revokeObjectURL(prev);
        }
        return url;
      });
      setCropAspect(kind === 'cover' ? '3:4' : '16:9');
      setCropOpen(true);
    } catch (err) {
      setError(describeCaughtError(err, '无法加载封面进行裁剪'));
    } finally {
      endBusy();
    }
  };

  const onCropConfirm = async (blob: Blob, fileName: string) => {
    const kind = cropAspect === '3:4' ? 'cover' : 'cover_landscape';
    const localPreview = URL.createObjectURL(blob);
    if (kind === 'cover') {
      setCoverPreviewUrl((prev) => {
        revokePreview(prev);
        return localPreview;
      });
    } else {
      setCoverLandscapePreviewUrl((prev) => {
        revokePreview(prev);
        return localPreview;
      });
    }
    const abort = new AbortController();
    uploadAbortRef.current = abort;
    beginBusy('uploading');
    setUploadHint(kind === 'cover' ? '上传竖封面…' : '上传横封面…');
    try {
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      const asset = await uploadMediaFile(
        file,
        kind,
        (ratio) => {
          setUploadHint(`上传封面 ${(ratio * 100).toFixed(0)}%`);
        },
        abort.signal,
      );
      if (kind === 'cover') {
        setCoverUrl(asset.url);
      } else {
        setCoverLandscapeUrl(asset.url);
      }
      setUploadHint(
        kind === 'cover' ? '竖版封面已裁剪替换并入库' : '横版封面已裁剪替换并入库',
      );
    } catch (err) {
      const cancelled =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.message === '上传已取消');
      if (cancelled) {
        setUploadHint('已取消上传');
        setError('');
      } else {
        setError(describeCaughtError(err, '封面上传失败'));
        setUploadHint('');
      }
    } finally {
      endBusy();
      setCropFile(null);
    }
  };

  const activeDouyinSelected = selectedAccounts.filter(
    ({ account }) => account.status === 'active',
  ).length;

  const prechecks = [
    {
      id: 'video' as const,
      ok: Boolean(videoUrl.trim()),
      fix: '请先选择并上传本地 MP4 视频',
      env: false,
    },
    {
      id: 'cover' as const,
      ok: Boolean(coverUrl.trim()),
      fix: '请上传视频以自动截帧，或选本地图裁剪竖版封面',
      env: false,
    },
    {
      id: 'coverLandscape' as const,
      ok: Boolean(coverLandscapeUrl.trim()),
      fix: '抖音需横版封面；上传视频可自动截帧，或选本地图裁剪',
      env: false,
    },
    {
      id: 'title' as const,
      ok: Boolean(title.trim()),
      fix: '请填写标题',
      env: false,
    },
    {
      id: 'accounts' as const,
      ok: activeDouyinSelected > 0,
      fix:
        accounts.length === 0 ? (
          <span>
            请先
            <Link to="/platform-accounts" className="mx-1 underline">
              绑定抖音账号
            </Link>
          </span>
        ) : (
          '请勾选至少一个正常状态的抖音账号'
        ),
      env: accounts.length === 0,
    },
    {
      id: 'agent' as const,
      ok: connected,
      fix:
        agentStatus === 'connecting' ? (
          '正在连接 Agent…'
        ) : (
          <span>
            请启动桌面 Agent（
            <Link2 className="inline size-3" /> ws://127.0.0.1:3927）
          </span>
        ),
      env: true,
    },
    {
      id: 'canPublish' as const,
      ok: canPublish,
      fix: publishBusy
        ? 'Agent 正忙于其它发布任务，请稍候'
        : connected
          ? '当前 Agent 无发布能力，请升级'
          : '需先连接 Agent',
      env: true,
    },
  ] as const;

  const publishBlocked = prechecks.some((item) => !item.ok);
  const firstBlock = prechecks.find((item) => !item.ok);
  // 门禁条已覆盖环境类阻塞时，底栏改展示摘要，避免与顶栏红字重复打架
  const showBottomBlock =
    firstBlock && (!firstBlock.env || firstBlock.id === 'accounts');
  const summaryText = [
    selectedAccounts.length > 0
      ? `分发 ${selectedAccounts.length} 个账号`
      : '未选择分发账号',
    scheduleEnabled && scheduledLocal ? '定时发布' : '立即发布',
  ].join(' · ');

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const gateReady = connected && canPublish && activeAccounts.length > 0;
  const hasVideo = Boolean(videoUrl.trim());
  const coversReady = Boolean(coverUrl.trim() && coverLandscapeUrl.trim());
  const coverHint = !coversReady
    ? '竖/横封面未就绪：可重新上传视频自动截帧，或悬停封面选图裁剪'
    : '封面已就绪；移入可裁剪或替换本地图';

  const primaryBusyLabel =
    busyPhase === 'uploading'
      ? '上传中…'
      : busyPhase === 'saving'
        ? '保存中…'
        : busyPhase === 'publishing'
          ? '发布中…'
          : '处理中…';

  const onDropVideo = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (loading || busy) {
      return;
    }
    const file = event.dataTransfer.files?.[0] ?? null;
    void onPickVideo(file);
  };

  const onBottomBlockActivate = () => {
    if (!firstBlock || !showBottomBlock) {
      return;
    }
    if (firstBlock.id === 'video') {
      focusBlock('video');
    } else if (firstBlock.id === 'cover' || firstBlock.id === 'coverLandscape') {
      focusBlock('cover');
    } else if (firstBlock.id === 'title') {
      focusBlock('title');
    } else if (firstBlock.id === 'accounts') {
      focusBlock('accounts');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-28">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Clapperboard className="size-6" />
          {editId ? '编辑视频' : '发布视频'}
        </h1>
        <p className="text-sm text-muted-foreground">
          拖入或选择 MP4，将自动生成抖音所需封面并推送到所选账号
        </p>
      </div>

      {/* 门禁：环境是否发得了 */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2 text-sm',
          gateReady
            ? 'border-border bg-muted/30 text-muted-foreground'
            : 'border-destructive/30 bg-destructive/5 text-destructive',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          {connected && canPublish && !publishBusy ? (
            <CheckCircle2 className="size-3.5 shrink-0" />
          ) : (
            <Link2 className="size-3.5 shrink-0" />
          )}
          {publishBusy
            ? 'Agent 正忙，请稍候'
            : connected
              ? canPublish
                ? '本机 Agent 已就绪'
                : '当前 Agent 无发布能力，请升级'
              : agentStatus === 'connecting'
                ? '正在连接 Agent…'
                : '请启动桌面 Agent'}
        </span>
        <span className="text-border">·</span>
        <span>
          {activeAccounts.length > 0 ? (
            <>可用抖音号 {activeAccounts.length} 个</>
          ) : accounts.length > 0 ? (
            <>
              账号不可用，请
              <Link to="/platform-accounts" className="mx-1 underline">
                重新授权
              </Link>
            </>
          ) : (
            <>
              尚未绑定抖音，请先
              <Link to="/platform-accounts" className="mx-1 underline">
                绑定媒体账号
              </Link>
            </>
          )}
        </span>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {uploadHint || publishHint ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <p className="min-w-0 flex-1">{publishHint || uploadHint}</p>
          {busyPhase === 'uploading' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => {
                cancelUpload();
              }}
            >
              取消上传
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              {/* 视频上传：主入口 */}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,.mp4"
                className="hidden"
                disabled={loading || busy}
                onChange={(e) => {
                  void onPickVideo(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              <div ref={videoSectionRef}>
              {!hasVideo ? (
                <button
                  type="button"
                  disabled={loading || busy}
                  className={cn(
                    'flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center transition-colors',
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
                    'disabled:pointer-events-none disabled:opacity-60',
                  )}
                  onClick={() => {
                    videoInputRef.current?.click();
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => {
                    setDragOver(false);
                  }}
                  onDrop={onDropVideo}
                >
                  <Upload className="size-8 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">拖入或选择 MP4 视频</p>
                    <p className="text-xs text-muted-foreground">
                      ≤1GB · H.264+AAC · 上传后自动生成竖/横封面
                    </p>
                  </div>
                </button>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">视频已就绪</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {videoFileName || '未命名视频'}
                        {videoFileSize != null
                          ? ` · ${formatBytes(videoFileSize)}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading || busy}
                      onClick={() => {
                        videoInputRef.current?.click();
                      }}
                    >
                      更换视频
                    </Button>
                  </div>
                </div>
              )}
              </div>

              {/* 有视频后再展开封面与标题 */}
              {hasVideo ? (
                <>
                  <Field ref={coverSectionRef}>
                    <FieldLabel>封面</FieldLabel>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <CoverHoverCard
                        label="竖版 3:4"
                        ready={Boolean(coverUrl)}
                        src={coverPreviewUrl || coverUrl}
                        objectFit="contain"
                        previewClassName="h-40 max-h-40 w-full"
                        disabled={loading || busy}
                        onCrop={() => {
                          void onCropExistingCover('cover');
                        }}
                        onReplace={(file) => {
                          onPickCover(file, 'cover');
                        }}
                      />
                      <CoverHoverCard
                        label="横版 16:9"
                        ready={Boolean(coverLandscapeUrl)}
                        src={coverLandscapePreviewUrl || coverLandscapeUrl}
                        aspectRatio={16 / 9}
                        previewClassName="w-full"
                        disabled={loading || busy}
                        onCrop={() => {
                          void onCropExistingCover('cover_landscape');
                        }}
                        onReplace={(file) => {
                          onPickCover(file, 'cover_landscape');
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
                      disabled={loading}
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                      }}
                    />
                  </Field>
                </>
              ) : null}

              <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
                <CollapsibleTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between px-2"
                    />
                  }
                >
                  <span>更多设置</span>
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform',
                      moreOpen ? 'rotate-180' : null,
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-4 pt-3">
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
                      disabled={loading}
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
                      disabled={loading}
                      value={location}
                      onChange={(e) => {
                        setLocation(e.target.value);
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>话题</FieldLabel>
                    <TagInput value={tags} onChange={setTags} disabled={loading} />
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
                      <SelectTrigger className="w-full" disabled={loading}>
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
                        disabled={loading}
                        checked={scheduleEnabled}
                        onCheckedChange={(checked) => {
                          setScheduleEnabled(checked === true);
                        }}
                      />
                    </div>
                    {scheduleEnabled ? (
                      <Input
                        ref={scheduleInputRef}
                        type="datetime-local"
                        disabled={loading}
                        value={scheduledLocal}
                        onChange={(e) => {
                          setScheduledLocal(e.target.value);
                        }}
                      />
                    ) : null}
                  </Field>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor="video-allow-download">
                        允许他人保存视频
                      </FieldLabel>
                    </FieldContent>
                    <Switch
                      id="video-allow-download"
                      disabled={loading}
                      checked={allowDownload}
                      onCheckedChange={(checked) => {
                        setAllowDownload(checked === true);
                      }}
                    />
                  </Field>

                  {selectedAccounts.length > 0 ? (
                    <div className="flex flex-col gap-2 border-t pt-4">
                      <p className="text-sm font-medium">按账号差异设置</p>
                      <p className="text-xs text-muted-foreground">
                        展开账号卡片可单独改标题/描述等；留空则用通用设置
                      </p>
                      {selectedAccounts.map(({ account, platformLabel }) => (
                        <OverrideCard
                          key={account.id}
                          account={account}
                          platformLabel={platformLabel}
                          draft={getDraft(account.id)}
                          disabled={loading || busy}
                          onDraftChange={(draft) => {
                            setDrafts((prev) => ({
                              ...prev,
                              [account.id]: draft,
                            }));
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </div>

        {/* 右栏：发到哪里 */}
        <div
          ref={accountsSectionRef}
          className="flex flex-col gap-4 lg:sticky lg:top-4"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">发布到</CardTitle>
              <CardDescription>
                {selectedAccounts.length > 0
                  ? `已选 ${selectedAccounts.length} 个抖音账号`
                  : '选择要推送的抖音账号'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!loading && accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  还没有绑定媒体账号，请先前往
                  <Link to="/platform-accounts" className="mx-1 underline">
                    媒体账号
                  </Link>
                  完成绑定。
                </p>
              ) : null}

              {grouped.map((group) => {
                const groupSelected = group.accounts.filter(
                  (a) => selected[a.id],
                ).length;
                return (
                  <div key={group.platform} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{group.displayName}</p>
                      <span className="text-xs text-muted-foreground">
                        {groupSelected}/{group.accounts.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 rounded-md border p-1.5">
                      {group.accounts.map((account) => {
                        const usable = account.status === 'active';
                        return (
                          <div
                            key={account.id}
                            className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 hover:bg-muted/60"
                          >
                            <Checkbox
                              id={`account-${account.id}`}
                              disabled={!usable || loading}
                              checked={Boolean(selected[account.id])}
                              onCheckedChange={(checked) => {
                                setSelected((prev) => ({
                                  ...prev,
                                  [account.id]: checked === true,
                                }));
                              }}
                            />
                            <label
                              htmlFor={`account-${account.id}`}
                              className={`flex-1 truncate text-sm ${usable ? '' : 'text-muted-foreground'}`}
                            >
                              {account.displayName}
                            </label>
                            {!usable ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-muted-foreground"
                              >
                                {ACCOUNT_STATUS_TEXT[account.status]}
                              </Badge>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
                <span className="text-muted-foreground">发布时机</span>
                <span>
                  {scheduleEnabled && scheduledLocal ? '定时' : '立即'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 底栏：摘要 + 操作；内容类阻塞可点跳转，环境类交给门禁条 */}
      <div className="sticky bottom-4 z-10">
        <div className="flex flex-col gap-2 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {publishBlocked && showBottomBlock && firstBlock ? (
              <button
                type="button"
                className="max-w-full truncate text-left text-destructive underline-offset-2 hover:underline"
                onClick={() => {
                  onBottomBlockActivate();
                }}
              >
                {firstBlock.fix}
              </button>
            ) : (
              summaryText
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              disabled={busy || loading}
              onClick={() => {
                void submit('draft');
              }}
            >
              <Save />
              {busyPhase === 'saving' ? '保存中…' : '存草稿'}
            </Button>
            <Button
              disabled={busy || loading || publishBlocked}
              onClick={() => {
                void submit('published');
              }}
            >
              <Send />
              {busy && busyPhase !== 'idle' ? primaryBusyLabel : '推送到抖音'}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog
        open={duplicateOpen}
        onOpenChange={(open) => {
          setDuplicateOpen(open);
          if (!open) {
            setDuplicateHit(null);
            pendingVideoRef.current = null;
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>检测到相同视频</AlertDialogTitle>
            <AlertDialogDescription>
              团队库中已有内容完全相同的视频
              {duplicateHit
                ? `「${duplicateHit.originalName}」（${formatBytes(duplicateHit.sizeBytes)}，${new Date(duplicateHit.createdAt).toLocaleString()}）`
                : ''}
              。建议直接使用已有资源，避免重复占用空间。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingVideoRef.current = null;
                setDuplicateHit(null);
              }}
            >
              取消
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const file = pendingVideoRef.current;
                setDuplicateOpen(false);
                setDuplicateHit(null);
                if (file) {
                  void ingestVideoFile(file, 'upload');
                }
              }}
            >
              仍要上传
            </Button>
            <AlertDialogAction
              onClick={() => {
                const file = pendingVideoRef.current;
                const hit = duplicateHit;
                setDuplicateOpen(false);
                setDuplicateHit(null);
                if (file && hit) {
                  void ingestVideoFile(file, 'reuse', {
                    url: hit.url,
                    originalName: hit.originalName,
                  });
                }
              }}
            >
              使用已有
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CoverCropDialog
        open={cropOpen}
        file={cropFile}
        sourceUrl={cropSourceUrl}
        aspect={cropAspect}
        title={cropAspect === '3:4' ? '裁剪竖版封面 3:4' : '裁剪横版封面 16:9'}
        onOpenChange={(open) => {
          setCropOpen(open);
          if (!open) {
            setCropFile(null);
            setCropSourceUrl((prev) => {
              if (prev?.startsWith('blob:')) {
                if (
                  prev !== coverPreviewUrl &&
                  prev !== coverLandscapePreviewUrl
                ) {
                  URL.revokeObjectURL(prev);
                }
              }
              return null;
            });
          }
        }}
        onConfirm={(blob, fileName) => {
          void onCropConfirm(blob, fileName);
        }}
      />
    </div>
  );
}

async function resolveCoverDisplayUrl(ref: string): Promise<string> {
  const value = ref.trim();
  if (value.startsWith('blob:') || value.startsWith('data:')) {
    return value;
  }

  let fetchUrl = value;
  if (!/^https?:\/\//i.test(value)) {
    const assetId = parseMediaAssetId(value);
    if (!assetId) {
      throw new Error('无效的封面资源');
    }
    const signed = await fetchMediaSignedUrl(assetId);
    fetchUrl = signed.url;
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error('封面下载失败');
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/') && blob.size === 0) {
    throw new Error('封面不是有效图片');
  }
  return URL.createObjectURL(blob);
}

function CoverHoverCard({
  label,
  ready,
  src,
  objectFit,
  aspectRatio,
  previewClassName,
  disabled,
  onCrop,
  onReplace,
}: {
  label: string;
  ready: boolean;
  src: string | null | undefined;
  objectFit?: 'cover' | 'contain';
  aspectRatio?: number;
  previewClassName?: string;
  disabled?: boolean;
  onCrop: () => void;
  onReplace: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasImage = Boolean(src?.trim());

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 rounded-lg border p-2',
        disabled ? 'opacity-60' : null,
      )}
    >
      <span className="text-xs text-muted-foreground">
        {label}
        {ready ? '' : ' · 待生成'}
      </span>
      <div className="relative overflow-hidden rounded-md">
        <MediaPreviewImage
          src={src}
          alt={`${label} 预览`}
          objectFit={objectFit}
          aspectRatio={aspectRatio}
          className={cn('shrink-0 border-0', previewClassName)}
        />
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center gap-2 bg-muted/80 opacity-0 backdrop-blur-[1px] transition-opacity',
            disabled
              ? 'pointer-events-none'
              : 'group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled || !hasImage}
            onClick={onCrop}
          >
            <Crop data-icon="inline-start" />
            裁剪
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            <ImagePlus data-icon="inline-start" />
            替换
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (file) {
            onReplace(file);
          }
        }}
      />
    </div>
  );
}
