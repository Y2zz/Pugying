import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Clapperboard, Hash, MapPin, Save, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  createContent,
  fetchContent,
  fetchPlatformAccounts,
  fetchPlatformCatalog,
  updateContent,
  type ContentStatus,
  type ContentTargetInput,
  type ContentTargetOverrides,
  type ContentVisibility,
  type PlatformAccountItem,
  type PlatformCatalogItem,
} from '@/lib/api';

const TITLE_MAX = 30;
const BODY_MAX = 1000;

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
    <div className="space-y-2">
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
                  <X className="size-3" />
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
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open ? (
        <CardContent className="space-y-4 border-t px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor={`ov-${account.id}-title`}>标题</Label>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor={`ov-${account.id}-cover`}>封面图 URL</Label>
              <Input
                id={`ov-${account.id}-cover`}
                placeholder="使用通用封面"
                disabled={disabled}
                value={draft.coverUrl}
                onChange={(e) => {
                  patch({ coverUrl: e.target.value });
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor={`ov-${account.id}-body`}>作品描述</Label>
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`ov-${account.id}-tags`}>话题（空格/逗号分隔）</Label>
              <Input
                id={`ov-${account.id}-tags`}
                placeholder="使用通用话题"
                disabled={disabled}
                value={draft.tagsText}
                onChange={(e) => {
                  patch({ tagsText: e.target.value });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`ov-${account.id}-schedule`}>定时发布时间</Label>
              <Input
                id={`ov-${account.id}-schedule`}
                type="datetime-local"
                disabled={disabled}
                value={draft.scheduledLocal}
                onChange={(e) => {
                  patch({ scheduledLocal: e.target.value });
                }}
              />
            </div>
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
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function PublishVideo() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');

  // 基础字段
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  // 发布设置
  const [visibility, setVisibility] = useState<ContentVisibility>('public');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  // 分发目标
  const [accounts, setAccounts] = useState<PlatformAccountItem[]>([]);
  const [catalog, setCatalog] = useState<PlatformCatalogItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, OverrideDraft>>({});

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [platforms, accountList] = await Promise.all([fetchPlatformCatalog(), fetchPlatformAccounts()]);
        if (cancelled) {
          return;
        }
        setCatalog(platforms);
        setAccounts(accountList);

        if (editId) {
          const item = await fetchContent(editId);
          if (cancelled) {
            return;
          }
          setTitle(item.title);
          setBody(item.body ?? '');
          setCoverUrl(item.coverUrl ?? '');
          setVideoUrl(item.mediaUrls[0] ?? '');
          setTags(item.tags);
          setLocation(item.location ?? '');
          setVisibility(item.visibility);
          setScheduleEnabled(Boolean(item.scheduledAt));
          setScheduledLocal(isoToLocalInput(item.scheduledAt));
          setAllowDownload(item.allowDownload);
          const nextSelected: Record<string, boolean> = {};
          const nextDrafts: Record<string, OverrideDraft> = {};
          for (const target of item.targets) {
            nextSelected[target.platformAccountId] = true;
            nextDrafts[target.platformAccountId] = overridesToDraft(target.overrides);
          }
          setSelected(nextSelected);
          setDrafts(nextDrafts);
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

  const submit = async (status: ContentStatus) => {
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    if (status === 'published' && !videoUrl.trim()) {
      setError('发布前请填写视频链接');
      return;
    }
    let scheduledIso = '';
    if (scheduleEnabled) {
      scheduledIso = localInputToIso(scheduledLocal);
      if (!scheduledIso) {
        setError('请选择定时发布时间');
        return;
      }
      const scheduleError = validateSchedule(scheduledIso);
      if (scheduleError) {
        setError(scheduleError);
        return;
      }
    }
    for (const { account } of selectedAccounts) {
      const iso = draftToOverrides(getDraft(account.id)).scheduledAt;
      if (iso) {
        const scheduleError = validateSchedule(iso);
        if (scheduleError) {
          setError(`「${account.displayName}」${scheduleError}`);
          return;
        }
      }
    }

    setBusy(true);
    setError('');
    const payload = {
      title: title.trim(),
      body: body.trim(),
      coverUrl: coverUrl.trim(),
      mediaUrls: videoUrl.trim() ? [videoUrl.trim()] : [],
      tags,
      location: location.trim(),
      visibility,
      scheduledAt: scheduleEnabled ? scheduledIso : '',
      allowDownload,
      targets: buildTargets(),
      status,
    };
    try {
      if (editId) {
        await updateContent(editId, payload);
      } else {
        await createContent({ type: 'video', ...payload });
      }
      void navigate('/contents');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setBusy(false);
    }
  };

  const summaryText = [
    selectedAccounts.length > 0 ? `分发 ${selectedAccounts.length} 个账号` : '未选择分发账号',
    scheduleEnabled && scheduledLocal ? '定时发布' : '立即发布',
  ].join(' · ');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      {/* 页头 */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Clapperboard className="size-6" />
          {editId ? '编辑视频' : '发布视频'}
        </h1>
        <p className="text-sm text-muted-foreground">字段规则参考抖音创作者平台；可分发到多个平台的多个账号，并按账号设置差异字段</p>
      </div>

      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 左栏：作品信息 + 差异设置 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">作品信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="video-title">标题</Label>
                  <span className="text-xs text-muted-foreground">
                    {title.length}/{TITLE_MAX}
                  </span>
                </div>
                <Input
                  id="video-title"
                  placeholder="填写作品标题，可能获得更多流量"
                  maxLength={TITLE_MAX}
                  disabled={loading}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="video-url">视频链接</Label>
                <Input
                  id="video-url"
                  placeholder="https://…（当前通过链接引用视频文件）"
                  disabled={loading}
                  value={videoUrl}
                  onChange={(e) => {
                    setVideoUrl(e.target.value);
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="video-body">作品描述（可选）</Label>
                  <span className="text-xs text-muted-foreground">
                    {body.length}/{BODY_MAX}
                  </span>
                </div>
                <Textarea
                  id="video-body"
                  placeholder="添加作品描述，合理的描述有助于推荐"
                  className="min-h-28"
                  maxLength={BODY_MAX}
                  disabled={loading}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                  }}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="video-cover">封面图 URL（可选）</Label>
                  <Input
                    id="video-cover"
                    placeholder="https://…"
                    disabled={loading}
                    value={coverUrl}
                    onChange={(e) => {
                      setCoverUrl(e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="video-location" className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    位置（可选）
                  </Label>
                  <Input
                    id="video-location"
                    placeholder="添加位置信息"
                    maxLength={100}
                    disabled={loading}
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>话题（可选，建议不超过 5 个）</Label>
                <TagInput value={tags} onChange={setTags} disabled={loading} />
              </div>
            </CardContent>
          </Card>

          {selectedAccounts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">差异设置</CardTitle>
                <CardDescription>展开账号卡片，为其单独设置标题/描述/封面/话题/定时；留空使用通用设置</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedAccounts.map(({ account, platformLabel }) => (
                  <OverrideCard
                    key={account.id}
                    account={account}
                    platformLabel={platformLabel}
                    draft={getDraft(account.id)}
                    disabled={loading || busy}
                    onDraftChange={(draft) => {
                      setDrafts((prev) => ({ ...prev, [account.id]: draft }));
                    }}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* 右栏：发布设置 + 发布账号（桌面端吸顶） */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">发布设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>谁可以看</Label>
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
                    {VISIBILITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="video-schedule">定时发布</Label>
                    <p className="text-xs text-muted-foreground">2 小时后至 14 天内</p>
                  </div>
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
                    type="datetime-local"
                    disabled={loading}
                    value={scheduledLocal}
                    onChange={(e) => {
                      setScheduledLocal(e.target.value);
                    }}
                  />
                ) : null}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="video-allow-download">允许他人保存视频</Label>
                  <p className="text-xs text-muted-foreground">关闭后不能下载此作品</p>
                </div>
                <Switch
                  id="video-allow-download"
                  disabled={loading}
                  checked={allowDownload}
                  onCheckedChange={(checked) => {
                    setAllowDownload(checked === true);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">发布账号</CardTitle>
              <CardDescription>{selectedAccounts.length > 0 ? `已选择 ${selectedAccounts.length} 个账号` : '可多平台、多账号分发'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
                const groupSelected = group.accounts.filter((a) => selected[a.id]).length;
                return (
                  <div key={group.platform} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{group.displayName}</p>
                      <span className="text-xs text-muted-foreground">
                        {groupSelected}/{group.accounts.length} 已选
                      </span>
                    </div>
                    <div className="space-y-1 rounded-md border p-1.5">
                      {group.accounts.map((account) => {
                        const usable = account.status === 'active';
                        return (
                          <div key={account.id} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 hover:bg-muted/60">
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
                            <label htmlFor={`account-${account.id}`} className={`flex-1 truncate text-sm ${usable ? '' : 'text-muted-foreground'}`}>
                              {account.displayName}
                            </label>
                            {!usable ? (
                              <Badge variant="outline" className="shrink-0 text-muted-foreground">
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 悬浮操作栏 */}
      <div className="sticky bottom-4 z-10">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="truncate text-sm text-muted-foreground">{summaryText}</p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              disabled={busy || loading}
              onClick={() => {
                void submit('draft');
              }}
            >
              <Save />
              存草稿
            </Button>
            <Button
              disabled={busy || loading}
              onClick={() => {
                void submit('published');
              }}
            >
              <Send />
              {busy ? '保存中…' : '发布'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
