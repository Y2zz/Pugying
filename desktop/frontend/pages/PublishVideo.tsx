import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Clapperboard } from 'lucide-react';
import {
  PageHeader,
  PageHeaderAction,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@/components/layouts/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  EditCoverDialog,
  type EditCoverAspect,
  type EditCoverSavedResult,
} from '@/components/EditCoverDialog';
import { toast } from '@/components/AppToaster';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';
import { useAgent } from '@/hooks/use-agent';
import { agentClient } from '@/lib/agent-client';
import {
  createContent,
  completeContentTarget,
  fetchContent,
  fetchCoverObjectUrl,
  fetchPlatformAccounts,
  fetchPlatformCatalog,
  getLocalFilePath,
  publishContent,
  startContentTarget,
  updateContent,
  uploadContentCover,
  type ContentItem,
  type ContentStatus,
  type ContentTargetInput,
  type PlatformAccountItem,
  type PlatformCatalogItem,
} from '@/lib/api';
import { describeCaughtError, describePublishError, describePublishPhase } from '@/lib/publish-errors';
import { cn } from '@/lib/utils';
import { extractCoverPairFromVideoFile } from '@/lib/video-cover';
import {
  PublishVideoActionBar,
  PublishVideoFormPanel,
  type PrecheckItem,
} from './publish-video/PublishVideoFormPanel';
import { PublishVideoPreviewPanel } from './publish-video/PublishVideoPreviewPanel';
import {
  MAX_VIDEO_BYTES,
  createUploadSpeedTracker,
  derivePublishFlowStep,
  describePublishFlowStep,
  draftFromTargetAndContent,
  draftToOverrides,
  emptyDraft,
  LOCAL_PATH_MISSING_VIDEO,
  localPathToFileUrl,
  looksUnstableLocalPath,
  checkLocalPathReadable,
  summarizeSelectedAccountIssues,
  validateSchedule,
  type BusyPhase,
  type CoverKind,
  type OverrideDraft,
  type VideoUploadMetrics,
  type VideoUploadPhase,
} from './publish-video/helpers';
import {
  PublishVideoProgressPanel,
  parseActivePublishAccountLabel,
} from './publish-video/PublishVideoProgressPanel';

export default function PublishVideo() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const { connected, publishBusy, canPublish, status: agentStatus } = useAgent();

  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [uploadMetrics, setUploadMetrics] = useState<VideoUploadMetrics | null>(null);
  const uploadSpeedTrackerRef = useRef(createUploadSpeedTracker());
  const [publishHint, setPublishHint] = useState('');
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  /** 递增以在窄屏下从底栏/checklist 聚焦账号时打开 Sheet */
  const [accountFocusNonce, setAccountFocusNonce] = useState(0);

  // 基础字段：媒体只存本机绝对路径，封面 BLOB 会话内先落 Blob
  const [title, setTitle] = useState('');
  const [mediaPath, setMediaPath] = useState('');
  const [videoFileName, setVideoFileName] = useState('');
  const [videoFileSize, setVideoFileSize] = useState<number | null>(null);
  const [pathWarning, setPathWarning] = useState('');
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverLandscapeBlob, setCoverLandscapeBlob] = useState<Blob | null>(null);
  const [hasCover, setHasCover] = useState(false);
  const [hasCoverLandscape, setHasCoverLandscape] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverLandscapePreviewUrl, setCoverLandscapePreviewUrl] = useState<string | null>(null);
  /** 会话内源图（供再次打开编辑；不随内容字段入库） */
  const [coverSourceUrl, setCoverSourceUrl] = useState<string | null>(null);
  const [coverLandscapeSourceUrl, setCoverLandscapeSourceUrl] = useState<string | null>(null);
  const [coverSourceFrameTime, setCoverSourceFrameTime] = useState<number | null>(null);
  const [coverLandscapeSourceFrameTime, setCoverLandscapeSourceFrameTime] =
    useState<number | null>(null);
  const [body, setBody] = useState('');
  const [location, setLocation] = useState('');
  const [editCoverOpen, setEditCoverOpen] = useState(false);
  const [editCoverAspect, setEditCoverAspect] = useState<EditCoverAspect>('portrait');
  const [editCoverVideoUrl, setEditCoverVideoUrl] = useState<string | null>(null);
  const [editCoverInitialSource, setEditCoverInitialSource] = useState<string | null>(null);
  const [editCoverInitialFrameTime, setEditCoverInitialFrameTime] = useState<
    number | null
  >(null);
  const [editCoverScope, setEditCoverScope] = useState<
    'common' | { accountId: string }
  >('common');
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
  const videoInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const coverSectionRef = useRef<HTMLDivElement>(null);
  const accountsSectionRef = useRef<HTMLDivElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  // 新建保存后的内容 id（可先于 URL ?id=）；有 editId 时优先用 URL，避免与 effect 同步打架
  const [createdContentId, setCreatedContentId] = useState<string | null>(null);
  const [contentStatus, setContentStatus] = useState<ContentStatus | null>(null);
  const ownedContentId = editId ?? createdContentId;

  const revokePreview = (url: string | null | undefined) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  const revokeVideoPreview = (url: string | null | undefined) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  // 卸载时回收会话内封面/源图/视频预览 blob，避免账号 draft 泄漏
  const coverSessionBlobsRef = useRef({
    coverPreviewUrl: null as string | null,
    coverLandscapePreviewUrl: null as string | null,
    coverSourceUrl: null as string | null,
    coverLandscapeSourceUrl: null as string | null,
    videoPreviewUrl: null as string | null,
    drafts: {} as Record<string, OverrideDraft>,
  });
  coverSessionBlobsRef.current = {
    coverPreviewUrl,
    coverLandscapePreviewUrl,
    coverSourceUrl,
    coverLandscapeSourceUrl,
    videoPreviewUrl,
    drafts,
  };
  useEffect(() => {
    return () => {
      const snap = coverSessionBlobsRef.current;
      revokePreview(snap.coverPreviewUrl);
      revokePreview(snap.coverLandscapePreviewUrl);
      revokePreview(snap.coverSourceUrl);
      revokePreview(snap.coverLandscapeSourceUrl);
      revokeVideoPreview(snap.videoPreviewUrl);
      for (const draft of Object.values(snap.drafts)) {
        revokePreview(draft.coverPreviewUrl);
        revokePreview(draft.coverLandscapePreviewUrl);
        revokePreview(draft.coverSourceUrl);
        revokePreview(draft.coverLandscapeSourceUrl);
      }
    };
    // 仅在页面卸载时回收
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setCoverSourceUrl((prev) => {
      revokePreview(prev);
      return null;
    });
    setCoverLandscapeSourceUrl((prev) => {
      revokePreview(prev);
      return null;
    });
    setCoverSourceFrameTime(null);
    setCoverLandscapeSourceFrameTime(null);
    setCoverBlob(null);
    setCoverLandscapeBlob(null);
    setHasCover(false);
    setHasCoverLandscape(false);
  };

  const resetUploadMetrics = (phase: VideoUploadPhase, totalBytes: number) => {
    uploadSpeedTrackerRef.current.reset();
    setUploadMetrics({
      phase,
      loadedBytes: 0,
      totalBytes,
      ratio: null,
      speedBps: 0,
    });
  };

  const beginBusy = (phase: BusyPhase) => {
    setBusy(true);
    setBusyPhase(phase);
  };

  const endBusy = () => {
    setBusy(false);
    setBusyPhase('idle');
    setUploadMetrics(null);
    uploadSpeedTrackerRef.current.reset();
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
          setHasCover(item.hasCover);
          setHasCoverLandscape(item.hasCoverLandscape);
          const media = item.mediaPaths[0] ?? '';
          setMediaPath(media);
          setVideoFileName(media ? media.split(/[/\\]/).pop() || '本机视频' : '');
          setVideoFileSize(null);
          if (media) {
            setVideoPreviewUrl((prev) => {
              revokeVideoPreview(prev);
              return localPathToFileUrl(media);
            });
            const readable = await checkLocalPathReadable(media);
            if (cancelled) {
              return;
            }
            if (!readable) {
              setPathWarning(LOCAL_PATH_MISSING_VIDEO);
            } else if (looksUnstableLocalPath(media)) {
              setPathWarning(
                '当前视频路径位于外置盘或网盘同步目录，文件变动后可能导致发布失败，建议复制到本机固定目录后再选。',
              );
            } else {
              setPathWarning(
                '发布依赖本机视频路径；请勿移动或删除该文件，否则推送会失败。',
              );
            }
          } else {
            setVideoPreviewUrl(null);
            setPathWarning('');
          }
          if (item.hasCover) {
            try {
              const url = await fetchCoverObjectUrl(item.id, 'portrait');
              if (!cancelled) {
                setCoverPreviewUrl((prev) => {
                  revokePreview(prev);
                  return url;
                });
              } else {
                URL.revokeObjectURL(url);
              }
            } catch {
              /* 封面拉取失败时仍保留 hasCover，checklist 仍视为就绪 */
            }
          }
          if (item.hasCoverLandscape) {
            try {
              const url = await fetchCoverObjectUrl(item.id, 'landscape');
              if (!cancelled) {
                setCoverLandscapePreviewUrl((prev) => {
                  revokePreview(prev);
                  return url;
                });
              } else {
                URL.revokeObjectURL(url);
              }
            } catch {
              /* ignore */
            }
          }
          setLocation(item.location ?? '');
          const nextSelected: Record<string, boolean> = {};
          const nextDrafts: Record<string, OverrideDraft> = {};
          const contentPublishDefaults = {
            tags: item.tags,
            visibility: item.visibility,
            scheduledAt: item.scheduledAt,
            allowDownload: item.allowDownload,
          };
          for (const target of item.targets) {
            if (target.platform !== 'douyin') {
              continue;
            }
            nextSelected[target.platformAccountId] = true;
            const draft = draftFromTargetAndContent(
              target.overrides,
              contentPublishDefaults,
            );
            draft.hasCover = target.hasCover;
            draft.hasCoverLandscape = target.hasCoverLandscape;
            if (target.hasCover) {
              try {
                draft.coverPreviewUrl = await fetchCoverObjectUrl(
                  item.id,
                  'portrait',
                  target.id,
                );
              } catch {
                /* ignore */
              }
            }
            if (target.hasCoverLandscape) {
              try {
                draft.coverLandscapePreviewUrl = await fetchCoverObjectUrl(
                  item.id,
                  'landscape',
                  target.id,
                );
              } catch {
                /* ignore */
              }
            }
            nextDrafts[target.platformAccountId] = draft;
          }
          if (cancelled) {
            for (const draft of Object.values(nextDrafts)) {
              revokePreview(draft.coverPreviewUrl);
              revokePreview(draft.coverLandscapePreviewUrl);
            }
            return;
          }
          setSelected(nextSelected);
          setDrafts(nextDrafts);
          setContentStatus(item.status);
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

  useEffect(() => {
    return () => {
      revokeVideoPreview(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

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

  /** 已选账号（按平台分组顺序），用于构建 targets */
  const selectedAccounts = useMemo(
    () =>
      grouped.flatMap((group) =>
        group.accounts
          .filter((account) => selected[account.id])
          .map((account) => ({ account, platformLabel: group.displayName })),
      ),
    [grouped, selected],
  );

  const getDraft = (accountId: string): OverrideDraft => drafts[accountId] ?? emptyDraft();

  const buildTargets = (): ContentTargetInput[] =>
    selectedAccounts.map(({ account }) => ({
      platformAccountId: account.id,
      overrides: draftToOverrides(getDraft(account.id)),
    }));

  /** 校验失败时滚到第一个阻塞项；封面/账号 checklist 携带 Tab 与账号 id */
  const focusPrecheck = (item: PrecheckItem) => {
    const scroll = (el: HTMLElement | null) => {
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    switch (item.focusKind) {
      case 'video':
        window.setTimeout(() => {
          scroll(videoSectionRef.current);
        }, 50);
        break;
      case 'cover':
        window.setTimeout(() => {
          scroll(coverSectionRef.current);
        }, 50);
        break;
      case 'title':
        window.setTimeout(() => {
          scroll(titleInputRef.current);
          titleInputRef.current?.focus();
        }, 50);
        break;
      case 'accounts':
      case 'accountConfig':
        {
          const accountId =
            item.focusAccountId ??
            selectedAccounts.find(({ account }) => account.status === 'active')?.account
              .id ??
            selectedAccounts[0]?.account.id;
          if (accountId) {
            setExpandedAccountId(accountId);
            setAccountFocusNonce((n) => {
              return n + 1;
            });
          }
        }
        window.setTimeout(() => {
          scroll(accountsSectionRef.current);
        }, 50);
        break;
      case 'agent':
        document
          .querySelector<HTMLElement>('[data-slot="sidebar-inset"]')
          ?.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      default:
        break;
    }
  };

  const focusBlock = (
    kind: NonNullable<PrecheckItem['focusKind']>,
    meta?: { accountId?: string },
  ) => {
    focusPrecheck({
      id: kind,
      label: '',
      ok: false,
      fix: '',
      focusKind: kind,
      focusAccountId: meta?.accountId,
    });
  };

  const coverReady = Boolean(coverBlob || hasCover || coverPreviewUrl);
  const coverLandscapeReady = Boolean(
    coverLandscapeBlob || hasCoverLandscape || coverLandscapePreviewUrl,
  );

  /** 内容落库后，再把会话内封面 Blob 上传到内容/账号差异列 */
  const uploadPendingCovers = async (saved: ContentItem) => {
    let next = saved;
    if (coverBlob) {
      next = await uploadContentCover(
        saved.id,
        'portrait',
        coverBlob,
        'cover.jpg',
      );
      setCoverBlob(null);
      setHasCover(true);
    }
    if (coverLandscapeBlob) {
      next = await uploadContentCover(
        saved.id,
        'landscape',
        coverLandscapeBlob,
        'cover-landscape.jpg',
      );
      setCoverLandscapeBlob(null);
      setHasCoverLandscape(true);
    }

    const updatedDrafts: Record<string, OverrideDraft> = { ...drafts };
    for (const target of next.targets) {
      const draft = updatedDrafts[target.platformAccountId] ?? getDraft(target.platformAccountId);
      let changed = false;
      if (draft.coverBlob) {
        next = await uploadContentCover(
          saved.id,
          'portrait',
          draft.coverBlob,
          'cover.jpg',
          target.id,
        );
        updatedDrafts[target.platformAccountId] = {
          ...draft,
          coverBlob: null,
          hasCover: true,
        };
        changed = true;
      }
      const afterPortrait = updatedDrafts[target.platformAccountId] ?? draft;
      if (afterPortrait.coverLandscapeBlob) {
        next = await uploadContentCover(
          saved.id,
          'landscape',
          afterPortrait.coverLandscapeBlob,
          'cover-landscape.jpg',
          target.id,
        );
        updatedDrafts[target.platformAccountId] = {
          ...afterPortrait,
          coverLandscapeBlob: null,
          hasCoverLandscape: true,
        };
        changed = true;
      }
      if (!changed && !updatedDrafts[target.platformAccountId]) {
        updatedDrafts[target.platformAccountId] = draft;
      }
    }
    setDrafts(updatedDrafts);
    return next;
  };

  const submit = async (status: ContentStatus) => {
    if (!title.trim()) {
      setError('请填写标题');
      focusBlock('title');
      return;
    }
    if (!mediaPath.trim()) {
      setError('请先选择本机 MP4 视频（需通过对话框选取以获取文件路径）');
      focusBlock('video');
      return;
    }
    if (status === 'published' && !coverReady) {
      setError('发布前请准备竖版封面（3:4）');
      focusBlock('cover');
      return;
    }
    if (status === 'published' && !coverLandscapeReady) {
      setError('发布抖音前请准备横版封面（4:3）');
      focusBlock('cover');
      return;
    }
    if (status === 'published' && selectedAccounts.length === 0) {
      setError('请至少选择一个抖音账号');
      focusBlock('accounts');
      return;
    }
    for (const { account } of selectedAccounts) {
      const iso = draftToOverrides(getDraft(account.id)).scheduledAt;
      if (iso) {
        const scheduleError = validateSchedule(iso);
        if (scheduleError) {
          setError(`「${account.displayName}」${scheduleError}`);
          setExpandedAccountId(account.id);
          focusBlock('accountConfig', { accountId: account.id });
          return;
        }
      }
    }

    if (status === 'published') {
      agentClient.connect();
      if (agentClient.getStatus() !== 'connected') {
        setError('本机服务未连接。请从「蒲公英」桌面应用打开后再发布。');
        focusBlock('agent');
        return;
      }
      if (!agentClient.getHello()?.capabilities.includes('platform.publish.start')) {
        setError('当前桌面端不支持发布能力，请升级蒲公英桌面应用');
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
      mediaPaths: mediaPath.trim() ? [mediaPath.trim()] : [],
      // 发布选项已迁至各账号 overrides；content 级字段保留 API 默认值
      tags: [],
      location: location.trim(),
      visibility: 'public' as const,
      allowDownload: true,
      targets: buildTargets(),
      // 已发布作品保存时不得退回草稿
      ...(contentStatus === 'published' ? {} : { status: 'draft' as ContentStatus }),
    };
    let contentId = ownedContentId;
    try {
      let saved: ContentItem;
      if (contentId) {
        saved = await updateContent(contentId, payload);
      } else {
        saved = await createContent({ type: 'video', ...payload });
        contentId = saved.id;
        setCreatedContentId(saved.id);
      }
      setPublishHint('正在上传封面…');
      saved = await uploadPendingCovers(saved);
      setContentStatus(saved.status);

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
        const outcomes: Array<{ ok: boolean; code?: string; message?: string }> = [];
        for (const dispatch of started.dispatches) {
          setPublishHint(`开始推送「${accountLabel(dispatch.accountId)}」…`);
          const { dispatch: live } = await startContentTarget(contentId, dispatch.targetId);
          const result = await agentClient.startPublish({
            targetId: live.targetId,
            platform: live.platform,
            accountId: live.accountId,
            mediaPath: live.mediaPath,
            coverPath: live.coverPath,
            coverLandscapePath: live.coverLandscapePath,
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

  const ingestVideoFile = async (file: File) => {
    setError('');
    const localPath = getLocalFilePath(file);
    if (!localPath) {
      setError(
        '无法获取本机文件路径。请确认在桌面应用内选择或拖入本地视频文件。',
      );
      return;
    }
    const abort = new AbortController();
    uploadAbortRef.current = abort;
    const replacing = Boolean(mediaPath.trim());
    setVideoFileName(file.name);
    setVideoFileSize(file.size);
    beginBusy('uploading');
    resetUploadMetrics('video', file.size);
    setMediaPath('');
    setVideoPreviewUrl((prev) => {
      revokeVideoPreview(prev);
      return null;
    });
    try {
      if (abort.signal.aborted) {
        throw new DOMException('上传已取消', 'AbortError');
      }

      setMediaPath(localPath);
      setVideoFileName(file.name);
      setVideoFileSize(file.size);
      const objectUrl = URL.createObjectURL(file);
      setVideoPreviewUrl((prev) => {
        revokeVideoPreview(prev);
        return objectUrl;
      });
      const readable = await checkLocalPathReadable(localPath);
      if (!readable) {
        setPathWarning(LOCAL_PATH_MISSING_VIDEO);
      } else if (looksUnstableLocalPath(localPath)) {
        toast.add({
          type: 'warning',
          title: '路径可能不稳定',
          description:
            '外置盘、iCloud、OneDrive 或百度网盘中的文件变动后可能导致发布失败，建议复制到本机固定目录。',
        });
        setPathWarning(
          '当前视频路径位于外置盘或网盘同步目录，文件变动后可能导致发布失败，建议复制到本机固定目录后再选。',
        );
      } else {
        setPathWarning(
          '发布将直接读取该本机路径；请勿移动或删除文件，否则推送会失败。',
        );
      }
      // 视频已切换后再清旧封面，取消处理时可保留更换前的封面
      clearCoverState();
      try {
        setUploadMetrics((prev) => {
          return prev
            ? {
                ...prev,
                phase: 'cover' as const,
                ratio: null,
                loadedBytes: 0,
                speedBps: 0,
              }
            : {
                phase: 'cover',
                loadedBytes: 0,
                totalBytes: file.size,
                ratio: null,
                speedBps: 0,
              };
        });
        const { portrait, landscape } = await extractCoverPairFromVideoFile(file);
        if (abort.signal.aborted) {
          throw new DOMException('上传已取消', 'AbortError');
        }

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
        setCoverBlob(portrait);
        setCoverLandscapeBlob(landscape);
        setHasCover(false);
        setHasCoverLandscape(false);
      } catch (coverErr) {
        if (coverErr instanceof DOMException && coverErr.name === 'AbortError') {
          throw coverErr;
        }
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
        setError('');
        if (!replacing) {
          setMediaPath('');
          setVideoFileName('');
          setVideoFileSize(null);
          setPathWarning('');
          setVideoPreviewUrl((prev) => {
            revokeVideoPreview(prev);
            return null;
          });
        }
      } else {
        setError(describeCaughtError(err, '视频处理失败'));
      }
    } finally {
      endBusy();
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
    await ingestVideoFile(file);
  };

  const resolveVideoUrlForEditor = async (): Promise<string | null> => {
    if (videoPreviewUrl?.trim()) {
      return videoPreviewUrl.trim();
    }
    if (!mediaPath.trim()) {
      return null;
    }
    return localPathToFileUrl(mediaPath);
  };

  const openEditCover = async (
    kind: CoverKind,
    scope: 'common' | { accountId: string } = 'common',
  ) => {
    const aspect: EditCoverAspect = kind === 'cover' ? 'portrait' : 'landscape';
    try {
      // 仅会话内「源图」优先；否则有视频时由 Dialog 截 0.1s；再否则用已有裁切图兜底
      let sourceCandidate: string | null = null;
      let sourceFrameTime: number | null = null;
      let croppedFallback: string | null = null;
      if (scope === 'common') {
        sourceCandidate =
          kind === 'cover' ? coverSourceUrl : coverLandscapeSourceUrl;
        sourceFrameTime =
          kind === 'cover' ? coverSourceFrameTime : coverLandscapeSourceFrameTime;
        croppedFallback =
          kind === 'cover' ? coverPreviewUrl : coverLandscapePreviewUrl;
      } else {
        const draft = getDraft(scope.accountId);
        sourceCandidate =
          kind === 'cover' ? draft.coverSourceUrl : draft.coverLandscapeSourceUrl;
        sourceFrameTime =
          kind === 'cover'
            ? draft.coverSourceFrameTime
            : draft.coverLandscapeSourceFrameTime;
        croppedFallback =
          kind === 'cover'
            ? draft.coverPreviewUrl || coverPreviewUrl
            : draft.coverLandscapePreviewUrl || coverLandscapePreviewUrl;
      }

      const videoForEditor = await resolveVideoUrlForEditor();
      let initialSource: string | null = null;
      if (sourceCandidate?.trim()) {
        initialSource = sourceCandidate.trim();
      } else if (!videoForEditor && croppedFallback?.trim()) {
        initialSource = croppedFallback.trim();
        sourceFrameTime = null;
      }

      setEditCoverAspect(aspect);
      setEditCoverInitialSource(initialSource);
      setEditCoverInitialFrameTime(
        initialSource && sourceFrameTime != null ? sourceFrameTime : null,
      );
      setEditCoverVideoUrl(videoForEditor);
      setEditCoverScope(scope);
      setEditCoverOpen(true);
      setError('');
    } catch (err) {
      toast.add({
        type: 'error',
        title: '打开封面编辑失败',
        description: err instanceof Error ? err.message : '未知错误',
      });
    }
  };

  const onEditCoverSaved = (result: EditCoverSavedResult) => {
    const isPortrait = editCoverAspect === 'portrait';
    const previewUrl = URL.createObjectURL(result.croppedFile);
    // 源图多为会话 blob；替换时勿 revoke 正在沿用的同一 URL
    const replaceSessionUrl = (
      prev: string | null | undefined,
      next: string,
    ) => {
      if (prev && prev !== next) {
        revokePreview(prev);
      }
      return next;
    };
    if (editCoverScope === 'common') {
      if (isPortrait) {
        setCoverSourceUrl((prev) => replaceSessionUrl(prev, result.sourceUrl));
        setCoverSourceFrameTime(result.sourceFrameTime);
        setCoverBlob(result.croppedFile);
        setHasCover(false);
        setCoverPreviewUrl((prev) => replaceSessionUrl(prev, previewUrl));
      } else {
        setCoverLandscapeSourceUrl((prev) =>
          replaceSessionUrl(prev, result.sourceUrl),
        );
        setCoverLandscapeSourceFrameTime(result.sourceFrameTime);
        setCoverLandscapeBlob(result.croppedFile);
        setHasCoverLandscape(false);
        setCoverLandscapePreviewUrl((prev) =>
          replaceSessionUrl(prev, previewUrl),
        );
      }
    } else {
      const accountId = editCoverScope.accountId;
      const draft = getDraft(accountId);
      if (isPortrait) {
        if (draft.coverSourceUrl && draft.coverSourceUrl !== result.sourceUrl) {
          revokePreview(draft.coverSourceUrl);
        }
        if (draft.coverPreviewUrl && draft.coverPreviewUrl !== previewUrl) {
          revokePreview(draft.coverPreviewUrl);
        }
        setDrafts((prev) => ({
          ...prev,
          [accountId]: {
            ...draft,
            coverBlob: result.croppedFile,
            coverPreviewUrl: previewUrl,
            hasCover: false,
            coverSourceUrl: result.sourceUrl,
            coverSourceFrameTime: result.sourceFrameTime,
          },
        }));
      } else {
        if (
          draft.coverLandscapeSourceUrl &&
          draft.coverLandscapeSourceUrl !== result.sourceUrl
        ) {
          revokePreview(draft.coverLandscapeSourceUrl);
        }
        if (
          draft.coverLandscapePreviewUrl &&
          draft.coverLandscapePreviewUrl !== previewUrl
        ) {
          revokePreview(draft.coverLandscapePreviewUrl);
        }
        setDrafts((prev) => ({
          ...prev,
          [accountId]: {
            ...draft,
            coverLandscapeBlob: result.croppedFile,
            coverLandscapePreviewUrl: previewUrl,
            hasCoverLandscape: false,
            coverLandscapeSourceUrl: result.sourceUrl,
            coverLandscapeSourceFrameTime: result.sourceFrameTime,
          },
        }));
      }
    }
    toast.add({
      type: 'success',
      title: isPortrait ? '竖版封面已保存' : '横版封面已保存',
    });
  };

  const activeDouyinSelected = selectedAccounts.filter(
    ({ account }) => account.status === 'active',
  ).length;

  const accountIssueSummary = useMemo(() => {
    return summarizeSelectedAccountIssues(
      selectedAccounts.map(({ account }) => ({
        account,
        draft: getDraft(account.id),
      })),
    );
  }, [selectedAccounts, drafts]);

  const checklistItems: PrecheckItem[] = [
    {
      id: 'video',
      label: '视频',
      ok: Boolean(mediaPath.trim()),
      fix: '请先通过对话框选择本机 MP4 视频',
      focusKind: 'video',
    },
    {
      id: 'cover',
      label: '竖封面',
      ok: coverReady,
      fix: '请选择视频以自动截帧，或选本地图裁剪竖版封面',
      focusKind: 'cover',
    },
    {
      id: 'coverLandscape',
      label: '横封面',
      ok: coverLandscapeReady,
      fix: '抖音需横版封面；选择视频可自动截帧，或选本地图裁剪',
      focusKind: 'cover',
    },
    {
      id: 'title',
      label: '标题',
      ok: Boolean(title.trim()),
      fix: '请填写标题',
      focusKind: 'title',
    },
    {
      id: 'accounts',
      label: '账号',
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
      focusKind: 'accounts',
    },
    {
      id: 'accountConfig',
      label:
        accountIssueSummary.issueCount > 0
          ? `账号配置 · ${accountIssueSummary.issueCount}`
          : '账号配置',
      ok: activeDouyinSelected > 0 && accountIssueSummary.issueCount === 0,
      fix:
        accountIssueSummary.issueCount > 0
          ? '请修正账号发布配置（定时、字数等）'
          : '已选账号的发布选项均已就绪',
      focusKind: 'accountConfig',
      focusAccountId: accountIssueSummary.firstIssueAccountId ?? undefined,
    },
    {
      id: 'agent',
      label: '本机服务',
      ok: connected && canPublish,
      fix:
        agentStatus === 'connecting' ? (
          '正在连接本机服务…'
        ) : publishBusy ? (
          '本机服务正忙于其它发布任务，请稍候'
        ) : connected ? (
          '当前桌面端无发布能力，请升级'
        ) : (
          <span>请从「蒲公英」桌面应用打开后再试</span>
        ),
      env: true,
      focusKind: 'agent',
    },
  ];

  const publishBlocked = checklistItems.some((item) => !item.ok);
  const readyCount = checklistItems.filter((item) => item.ok).length;

  const hasVideo = Boolean(mediaPath.trim());
  const coversReady = coverReady && coverLandscapeReady;
  const coverHint =
    busyPhase === 'uploading'
      ? '视频处理中，封面将自动截帧；可先填写标题与账号'
      : !coversReady
        ? '竖/横封面未就绪：可重新选择视频自动截帧，或点击槽位编辑封面'
        : '封面已就绪；点击槽位可取帧、上传或调整构图';

  const hasSelectedVideo = Boolean(videoFileName.trim()) || hasVideo;
  const formLocked = loading || busyPhase === 'saving' || busyPhase === 'publishing';
  const coverLocked = formLocked || busyPhase === 'uploading';

  const flowStep = derivePublishFlowStep({
    hasVideo,
    loading,
    editId,
    busyPhase,
    publishHint,
  });
  const showPublishPanel = flowStep === 'publish' || flowStep === 'progress';
  const showFormPanel = hasSelectedVideo && !showPublishPanel;
  const showPhoneColumn = flowStep !== 'select';
  const showSplitLayout = showFormPanel || showPublishPanel;
  const publishProgressAccounts = selectedAccounts
    .filter(({ account }) => account.status === 'active')
    .map(({ account }) => ({ id: account.id, displayName: account.displayName }));
  const activePublishAccountLabel = parseActivePublishAccountLabel(publishHint);

  const primaryBusyLabel =
    busyPhase === 'uploading'
      ? '处理中…'
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

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-6xl flex-col gap-4">
      <PageHeader>
        <PageHeaderTitle className="flex items-center gap-2">
          <Clapperboard className="size-5" />
          {editId ? '编辑视频' : '发布视频'}
        </PageHeaderTitle>
        <PageHeaderDescription>{describePublishFlowStep(flowStep)}</PageHeaderDescription>
        <PageHeaderAction>
          <AgentStatusBadge />
        </PageHeaderAction>
      </PageHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>无法继续</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {pathWarning && !error ? (
        <Alert
          variant={
            pathWarning === LOCAL_PATH_MISSING_VIDEO ? 'destructive' : 'default'
          }
        >
          <AlertCircle />
          <AlertTitle>
            {pathWarning === LOCAL_PATH_MISSING_VIDEO
              ? '源文件不可用'
              : '本机路径依赖'}
          </AlertTitle>
          <AlertDescription>{pathWarning}</AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-6 lg:items-stretch',
          showSplitLayout ? 'lg:grid-cols-[minmax(0,1fr)_240px]' : 'w-full',
        )}
      >
        {showFormPanel ? (
          <div className="order-2 min-h-0 lg:order-1">
            <PublishVideoFormPanel
              catalog={catalog}
              accounts={accounts}
              grouped={grouped}
              selected={selected}
              setSelected={setSelected}
              expandedAccountId={expandedAccountId}
              setExpandedAccountId={setExpandedAccountId}
              accountFocusNonce={accountFocusNonce}
              drafts={drafts}
              setDraftForAccount={(accountId, draft) => {
                setDrafts((prev) => ({
                  ...prev,
                  [accountId]: draft,
                }));
              }}
              getDraft={getDraft}
              loading={loading}
              accountsEmpty={!loading && accounts.length === 0}
              accountsSectionRef={accountsSectionRef}
              coverSectionRef={coverSectionRef}
              title={title}
              setTitle={setTitle}
              body={body}
              setBody={setBody}
              coverReady={coverReady}
              coverLandscapeReady={coverLandscapeReady}
              coverPreviewUrl={coverPreviewUrl}
              coverLandscapePreviewUrl={coverLandscapePreviewUrl}
              coverHint={coverHint}
              onEditCover={(kind) => {
                void openEditCover(kind, 'common');
              }}
              onEditAccountCover={(accountId, kind) => {
                void openEditCover(kind, { accountId });
              }}
              titleInputRef={titleInputRef}
              disabled={formLocked}
              coverDisabled={coverLocked}
            />
          </div>
        ) : null}

        {showPublishPanel ? (
          <div className="order-2 min-h-0 lg:order-1">
            <PublishVideoProgressPanel
              flowStep={flowStep}
              publishHint={publishHint}
              accounts={publishProgressAccounts}
              activeAccountLabel={activePublishAccountLabel}
            />
          </div>
        ) : null}

        <div className={cn('order-1', showSplitLayout && 'lg:order-2')}>
          <PublishVideoPreviewPanel
            videoSectionRef={videoSectionRef}
            videoInputRef={videoInputRef}
            showPhoneColumn={showPhoneColumn}
            hasVideo={hasVideo}
            videoFileName={videoFileName}
            videoFileSize={videoFileSize}
            videoPreviewUrl={videoPreviewUrl}
            dragOver={dragOver}
            disabled={loading || busy || showPublishPanel}
            uploading={busyPhase === 'uploading'}
            uploadMetrics={uploadMetrics}
            onPickClick={() => {
              videoInputRef.current?.click();
            }}
            onFileChange={(file) => {
              void onPickVideo(file);
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
            onCancelUpload={cancelUpload}
          />
        </div>
      </div>

      {showFormPanel ? (
        <PublishVideoActionBar
          prechecks={checklistItems}
          readyCount={readyCount}
          totalCount={checklistItems.length}
          busy={formLocked}
          busyLabel={primaryBusyLabel}
          publishBlocked={publishBlocked}
          publishHint={publishHint}
          onFocusItem={focusPrecheck}
          onSaveDraft={() => {
            void submit('draft');
          }}
          onPublish={() => {
            void submit('published');
          }}
        />
      ) : null}

      <EditCoverDialog
        open={editCoverOpen}
        aspect={editCoverAspect}
        videoUrl={editCoverVideoUrl}
        initialSourceUrl={editCoverInitialSource}
        initialFrameTime={editCoverInitialFrameTime}
        onOpenChange={(open) => {
          setEditCoverOpen(open);
          if (!open) {
            setEditCoverInitialSource((prev) => {
              if (prev?.startsWith('blob:')) {
                if (
                  prev !== coverPreviewUrl &&
                  prev !== coverLandscapePreviewUrl &&
                  prev !== coverSourceUrl &&
                  prev !== coverLandscapeSourceUrl &&
                  prev !== editCoverVideoUrl
                ) {
                  URL.revokeObjectURL(prev);
                }
              }
              return null;
            });
            setEditCoverInitialFrameTime(null);
            setEditCoverVideoUrl(null);
          }
        }}
        onSaved={onEditCoverSaved}
      />
    </div>
  );
}
