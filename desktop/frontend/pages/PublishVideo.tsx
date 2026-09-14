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
  type MediaDuplicateHit,
  type MediaUploadProgress,
  type PlatformAccountItem,
  type PlatformCatalogItem,
} from '@/lib/api';
import { sha256File } from '@/lib/file-hash';
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

  // 基础字段
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFileName, setVideoFileName] = useState('');
  const [videoFileSize, setVideoFileSize] = useState<number | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [coverLandscapeUrl, setCoverLandscapeUrl] = useState('');
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
  const [duplicateHit, setDuplicateHit] = useState<MediaDuplicateHit | null>(null);
  const pendingVideoRef = useRef<File | null>(null);
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
    setCoverUrl('');
    setCoverLandscapeUrl('');
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

  const reportUploadProgress = (phase: VideoUploadPhase, progress: MediaUploadProgress) => {
    const speedBps = uploadSpeedTrackerRef.current.sample(progress.loadedBytes);
    setUploadMetrics({
      phase,
      loadedBytes: progress.loadedBytes,
      totalBytes: progress.totalBytes,
      ratio: progress.ratio,
      speedBps,
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
        const [platforms, accountList] = await Promise.all([fetchPlatformCatalog(), fetchPlatformAccounts()]);
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
          const media = item.mediaUrls[0] ?? '';
          setVideoUrl(media);
          setVideoFileName(media ? '本机媒体库视频' : '');
          setVideoFileSize(null);
          if (media) {
            void resolveVideoPreviewUrl(media)
              .then((url) => {
                if (!cancelled) {
                  setVideoPreviewUrl((prev) => {
                    revokeVideoPreview(prev);
                    return url;
                  });
                }
              })
              .catch(() => {
                if (!cancelled) {
                  setVideoPreviewUrl(null);
                }
              });
          } else {
            setVideoPreviewUrl(null);
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
            nextDrafts[target.platformAccountId] = draftFromTargetAndContent(target.overrides, contentPublishDefaults);
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
      grouped.flatMap((group) => group.accounts.filter((account) => selected[account.id]).map((account) => ({ account, platformLabel: group.displayName }))),
    [grouped, selected]
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
            selectedAccounts.find(({ account }) => account.status === 'active')?.account.id ??
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

  const focusBlock = (kind: NonNullable<PrecheckItem['focusKind']>, meta?: { accountId?: string }) => {
    focusPrecheck({
      id: kind,
      label: '',
      ok: false,
      fix: '',
      focusKind: kind,
      focusAccountId: meta?.accountId,
    });
  };

  const submit = async (status: ContentStatus) => {
    if (!title.trim()) {
      setError('请填写标题');
      focusBlock('title');
      return;
    }
    if (!videoUrl.trim()) {
      setError('请先上传视频（MP4）到本机媒体库');
      focusBlock('video');
      return;
    }
    if (status === 'published' && !coverUrl.trim()) {
      setError('发布前请准备竖版封面（3:4）');
      focusBlock('cover');
      return;
    }
    if (status === 'published' && !coverLandscapeUrl.trim()) {
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
      coverUrl: coverUrl.trim(),
      coverLandscapeUrl: coverLandscapeUrl.trim(),
      mediaUrls: videoUrl.trim() ? [videoUrl.trim()] : [],
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
      if (contentId) {
        await updateContent(contentId, payload);
      } else {
        const created = await createContent({ type: 'video', ...payload });
        contentId = created.id;
        setCreatedContentId(created.id);
      }

      if (status !== 'published' || !contentId) {
        setPublishHint('草稿已保存');
        void navigate('/contents');
        return;
      }

      setPublishHint('正在向后端申请发布…');
      const started = await publishContent(contentId);
      const accountLabel = (accountId: string) => accounts.find((a) => a.id === accountId)?.displayName ?? `账号 ${accountId.slice(0, 8)}`;
      const labelForTarget = (targetId: string) => {
        const hit = started.dispatches.find((d) => d.targetId === targetId);
        return hit ? accountLabel(hit.accountId) : '抖音';
      };
      const unsub = agentClient.subscribePublishProgress((event) => {
        setPublishHint(`${labelForTarget(event.targetId)} · ${describePublishPhase(event.phase)}${event.message ? ` · ${event.message}` : ''}`);
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
            : `部分成功（${outcomes.length - failed.length}/${outcomes.length}）。${describePublishError(first.code, first.message)} 可在内容列表重试失败账号。`
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

  const clearDuplicatePrompt = () => {
    pendingVideoRef.current = null;
    setDuplicateHit(null);
    setVideoFileName('');
    setVideoFileSize(null);
    // 取消重复决策后回到上传 dropzone，而非「更换」预览态
    setVideoPreviewUrl((prev) => {
      revokeVideoPreview(prev);
      return null;
    });
  };

  const confirmDuplicateReuse = () => {
    const file = pendingVideoRef.current;
    const hit = duplicateHit;
    if (!file || !hit) {
      return;
    }
    setDuplicateHit(null);
    void ingestVideoFile(file, 'reuse', {
      url: hit.url,
      originalName: hit.originalName,
    });
  };

  const confirmDuplicateForceUpload = () => {
    const file = pendingVideoRef.current;
    if (!file) {
      return;
    }
    setDuplicateHit(null);
    void ingestVideoFile(file, 'upload');
  };

  const ingestVideoFile = async (file: File, mode: 'upload' | 'reuse', existing?: { url: string; originalName?: string }) => {
    setError('');
    const abort = new AbortController();
    uploadAbortRef.current = abort;
    const replacing = Boolean(videoUrl.trim());
    let videoLabel = existing?.originalName?.trim() || file.name;
    setVideoFileName(videoLabel);
    setVideoFileSize(file.size);
    beginBusy('uploading');
    if (mode === 'upload') {
      setVideoUrl('');
      setVideoPreviewUrl((prev) => {
        revokeVideoPreview(prev);
        return null;
      });
      resetUploadMetrics('video', file.size);
    }
    try {
      if (abort.signal.aborted) {
        throw new DOMException('上传已取消', 'AbortError');
      }

      let videoAssetUrl = existing?.url?.trim() ?? '';
      if (mode === 'upload') {
        const asset = await uploadMediaFile(
          file,
          'video',
          (progress) => {
            reportUploadProgress('video', progress);
          },
          abort.signal
        );
        videoAssetUrl = asset.url;
        videoLabel = asset.originalName;
      } else if (!videoAssetUrl) {
        throw new Error('缺少可复用的视频资源');
      }
      setVideoUrl(videoAssetUrl);
      setVideoFileName(videoLabel);
      setVideoFileSize(file.size);
      // 视频入库后再生成本地预览，上传过程中不展示画面
      const objectUrl = URL.createObjectURL(file);
      setVideoPreviewUrl((prev) => {
        revokeVideoPreview(prev);
        return objectUrl;
      });
      // 视频已切换后再清旧封面，取消上传时可保留更换前的封面
      clearCoverState();

      try {
        setUploadMetrics((prev) => {
          return prev
            ? { ...prev, phase: 'cover' as const, ratio: null, loadedBytes: 0, speedBps: 0 }
            : { phase: 'cover', loadedBytes: 0, totalBytes: file.size, ratio: null, speedBps: 0 };
        });
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

        const coverAsset = await uploadMediaFile(
          new File([portrait], `${baseName}-cover-3x4.jpg`, {
            type: 'image/jpeg',
          }),
          'cover',
          () => {},
          abort.signal
        );
        setCoverUrl(coverAsset.url);

        const landscapeAsset = await uploadMediaFile(
          new File([landscape], `${baseName}-cover-4x3.jpg`, {
            type: 'image/jpeg',
          }),
          'cover_landscape',
          () => {},
          abort.signal
        );
        setCoverLandscapeUrl(landscapeAsset.url);
      } catch (coverErr) {
        if (coverErr instanceof DOMException && coverErr.name === 'AbortError') {
          throw coverErr;
        }
        setError(coverErr instanceof Error ? `自动提取封面失败：${coverErr.message}` : '自动提取封面失败，请本地选图并裁剪');
      }
    } catch (err) {
      const cancelled = (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.message === '上传已取消');
      if (cancelled) {
        setError('');
        if (!replacing) {
          setVideoFileName('');
          setVideoFileSize(null);
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
    setDuplicateHit(null);
    setVideoFileName(file.name);
    setVideoFileSize(file.size);
    resetUploadMetrics('checksum', file.size);
    const abort = new AbortController();
    uploadAbortRef.current = abort;
    beginBusy('uploading');
    try {
      const checksum = await sha256File(file, () => {});
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
        endBusy();
        return;
      }
      await ingestVideoFile(file, 'upload');
    } catch (err) {
      const cancelled = (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.message === '上传已取消');
      if (cancelled) {
        setError('');
        if (!videoUrl.trim()) {
          setVideoFileName('');
          setVideoFileSize(null);
          setVideoPreviewUrl((prev) => {
            revokeVideoPreview(prev);
            return null;
          });
        }
      } else {
        setError(describeCaughtError(err, '视频校验失败'));
      }
      endBusy();
    }
  };

  const resolveVideoUrlForEditor = async (): Promise<string | null> => {
    if (videoPreviewUrl?.trim()) {
      return videoPreviewUrl.trim();
    }
    if (!videoUrl.trim()) {
      return null;
    }
    return resolveVideoPreviewUrl(videoUrl);
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
          kind === 'cover'
            ? coverPreviewUrl || coverUrl
            : coverLandscapePreviewUrl || coverLandscapeUrl;
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
            ? draft.coverUrl || coverPreviewUrl || coverUrl
            : draft.coverLandscapeUrl || coverLandscapePreviewUrl || coverLandscapeUrl;
      }

      const videoForEditor = await resolveVideoUrlForEditor();
      let initialSource: string | null = null;
      if (sourceCandidate?.trim()) {
        initialSource = await resolveCoverDisplayUrl(sourceCandidate);
      } else if (!videoForEditor && croppedFallback?.trim()) {
        initialSource = await resolveCoverDisplayUrl(croppedFallback);
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
        setCoverUrl(result.croppedUrl);
        setCoverPreviewUrl((prev) => replaceSessionUrl(prev, result.croppedUrl));
      } else {
        setCoverLandscapeSourceUrl((prev) =>
          replaceSessionUrl(prev, result.sourceUrl),
        );
        setCoverLandscapeSourceFrameTime(result.sourceFrameTime);
        setCoverLandscapeUrl(result.croppedUrl);
        setCoverLandscapePreviewUrl((prev) =>
          replaceSessionUrl(prev, result.croppedUrl),
        );
      }
    } else {
      const accountId = editCoverScope.accountId;
      const draft = getDraft(accountId);
      if (isPortrait) {
        if (
          draft.coverSourceUrl &&
          draft.coverSourceUrl !== result.sourceUrl
        ) {
          revokePreview(draft.coverSourceUrl);
        }
        setDrafts((prev) => ({
          ...prev,
          [accountId]: {
            ...draft,
            coverUrl: result.croppedUrl,
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
        setDrafts((prev) => ({
          ...prev,
          [accountId]: {
            ...draft,
            coverLandscapeUrl: result.croppedUrl,
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

  const activeDouyinSelected = selectedAccounts.filter(({ account }) => account.status === 'active').length;

  const accountIssueSummary = useMemo(() => {
    return summarizeSelectedAccountIssues(
      selectedAccounts.map(({ account }) => ({
        account,
        draft: getDraft(account.id),
      }))
    );
  }, [selectedAccounts, drafts]);

  const checklistItems: PrecheckItem[] = [
    {
      id: 'video',
      label: '视频',
      ok: Boolean(videoUrl.trim()),
      fix: '请先选择并上传本地 MP4 视频',
      focusKind: 'video',
    },
    {
      id: 'cover',
      label: '竖封面',
      ok: Boolean(coverUrl.trim()),
      fix: '请上传视频以自动截帧，或选本地图裁剪竖版封面',
      focusKind: 'cover',
    },
    {
      id: 'coverLandscape',
      label: '横封面',
      ok: Boolean(coverLandscapeUrl.trim()),
      fix: '抖音需横版封面；上传视频可自动截帧，或选本地图裁剪',
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

  const hasVideo = Boolean(videoUrl.trim());
  const coversReady = Boolean(coverUrl.trim() && coverLandscapeUrl.trim());
  const coverHint =
    busyPhase === 'uploading'
      ? '视频上传中，封面将在完成后自动截帧；可先填写标题与账号'
      : !coversReady
        ? '竖/横封面未就绪：可重新上传视频自动截帧，或点击槽位编辑封面'
        : '封面已就绪；点击槽位可取帧、上传或调整构图';

  const hasSelectedVideo = Boolean(videoFileName.trim()) || hasVideo;
  const formLocked = loading || busyPhase === 'saving' || busyPhase === 'publishing';
  const coverLocked = formLocked || busyPhase === 'uploading';

  const flowStep = derivePublishFlowStep({
    hasVideo,
    loading,
    editId,
    busyPhase,
    duplicateHit,
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

  const primaryBusyLabel = busyPhase === 'uploading' ? '上传中…' : busyPhase === 'saving' ? '保存中…' : busyPhase === 'publishing' ? '发布中…' : '处理中…';

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
        <PageHeaderDescription>{describePublishFlowStep(flowStep, duplicateHit != null)}</PageHeaderDescription>
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

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-6 lg:items-stretch',
          showSplitLayout ? 'lg:grid-cols-[minmax(0,1fr)_240px]' : 'w-full'
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
              coverUrl={coverUrl}
              coverLandscapeUrl={coverLandscapeUrl}
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
            duplicateHit={duplicateHit}
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
            onDuplicateCancel={clearDuplicatePrompt}
            onDuplicateForceUpload={confirmDuplicateForceUpload}
            onDuplicateReuse={confirmDuplicateReuse}
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

async function resolveVideoPreviewUrl(ref: string): Promise<string> {
  const value = ref.trim();
  if (value.startsWith('blob:') || value.startsWith('data:')) {
    return value;
  }

  let fetchUrl = value;
  if (!/^https?:\/\//i.test(value)) {
    const assetId = parseMediaAssetId(value);
    if (!assetId) {
      throw new Error('无效的视频资源');
    }
    const signed = await fetchMediaSignedUrl(assetId);
    fetchUrl = signed.url;
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error('视频下载失败');
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('video/') && blob.size === 0) {
    throw new Error('视频不是有效文件');
  }
  return URL.createObjectURL(blob);
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
