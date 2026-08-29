import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clapperboard, Link2, Save, Send, Video } from 'lucide-react';
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@/components/layouts/PageHeader';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
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
import { CoverCropDialog, type CoverAspect } from '@/components/CoverCropDialog';
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
  type ContentVisibility,
  type MediaDuplicateHit,
  type PlatformAccountItem,
  type PlatformCatalogItem,
} from '@/lib/api';
import { sha256File } from '@/lib/file-hash';
import { describeCaughtError, describePublishError, describePublishPhase } from '@/lib/publish-errors';
import { extractCoverPairFromVideoFile } from '@/lib/video-cover';
import { PublishRulesStep } from './publish-video/PublishRulesStep';
import { VideoSelectStep } from './publish-video/VideoSelectStep';
import {
  MAX_VIDEO_BYTES,
  WARN_DURATION_SEC,
  draftToOverrides,
  emptyDraft,
  formatBytes,
  isoToLocalInput,
  localInputToIso,
  overrideCount,
  overridesToDraft,
  validateSchedule,
  type BusyPhase,
  type CoverKind,
  type OverrideDraft,
  RULE_FOCUS_COMMON,
  type PublishStep,
  type RuleFocus,
} from './publish-video/helpers';

export default function PublishVideo() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const { connected, publishBusy, canPublish, status: agentStatus } = useAgent();

  const [step, setStep] = useState<PublishStep>(1);
  const [ruleFocus, setRuleFocus] = useState<RuleFocus>(RULE_FOCUS_COMMON);

  // 基础字段
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFileName, setVideoFileName] = useState('');
  const [videoFileSize, setVideoFileSize] = useState<number | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [coverLandscapeUrl, setCoverLandscapeUrl] = useState('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverLandscapePreviewUrl, setCoverLandscapePreviewUrl] = useState<string | null>(null);
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
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateHit, setDuplicateHit] = useState<MediaDuplicateHit | null>(null);
  const pendingVideoRef = useRef<File | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const coverSectionRef = useRef<HTMLDivElement>(null);
  const accountsSectionRef = useRef<HTMLDivElement>(null);
  const scheduleInputRef = useRef<HTMLButtonElement>(null);
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
          setVideoFileName(media ? '团队库视频' : '');
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
            nextDrafts[target.platformAccountId] = overridesToDraft(target.overrides);
          }
          setSelected(nextSelected);
          setDrafts(nextDrafts);
          setContentStatus(item.status);
          // 编辑已有视频时直接进入发布规则
          if (media.trim()) {
            setStep(2);
          }
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

  /** 已选账号（按平台分组顺序），用于构建 targets */
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

  /** 校验失败时滚到第一个阻塞项；差异定时需切到对应账号 */
  const focusBlock = (kind: 'video' | 'cover' | 'title' | 'accounts' | 'schedule' | 'agent') => {
    const scroll = (el: HTMLElement | null) => {
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    switch (kind) {
      case 'video':
        setStep(1);
        window.setTimeout(() => {
          scroll(videoSectionRef.current);
        }, 50);
        break;
      case 'cover':
        setStep(2);
        setRuleFocus(RULE_FOCUS_COMMON);
        window.setTimeout(() => {
          scroll(coverSectionRef.current);
        }, 50);
        break;
      case 'title':
        setStep(2);
        setRuleFocus(RULE_FOCUS_COMMON);
        window.setTimeout(() => {
          scroll(titleInputRef.current);
          titleInputRef.current?.focus();
        }, 50);
        break;
      case 'accounts':
        setStep(2);
        window.setTimeout(() => {
          scroll(accountsSectionRef.current);
        }, 50);
        break;
      case 'schedule':
        setStep(2);
        setRuleFocus(RULE_FOCUS_COMMON);
        window.setTimeout(() => {
          scroll(scheduleInputRef.current);
          scheduleInputRef.current?.focus();
        }, 50);
        break;
      case 'agent':
        setStep(2);
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
          setStep(2);
          setRuleFocus(account.id);
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

  const ingestVideoFile = async (file: File, mode: 'upload' | 'reuse', existing?: { url: string; originalName?: string }) => {
    setError('');
    const abort = new AbortController();
    uploadAbortRef.current = abort;
    beginBusy('uploading');
    setUploadHint(mode === 'reuse' ? '使用团队库已有视频…' : '上传视频中…');
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
        setUploadHint(`时长约 ${Math.round(durationSec / 60)} 分钟（超过 15 分钟仅警告，仍可继续）`);
      }

      let videoAssetUrl = existing?.url?.trim() ?? '';
      let videoLabel = existing?.originalName?.trim() || file.name;
      if (mode === 'upload') {
        const asset = await uploadMediaFile(
          file,
          'video',
          (ratio) => {
            setUploadHint(`上传视频 ${(ratio * 100).toFixed(0)}%`);
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
          abort.signal
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
          abort.signal
        );
        setCoverLandscapeUrl(landscapeAsset.url);
        setUploadHint(
          mode === 'reuse' ? `已复用团队库视频，并重新生成封面（来源：${videoLabel}）` : '视频与竖/横封面已入库（封面来自视频截帧，可裁剪调整）'
        );
      } catch (coverErr) {
        if (coverErr instanceof DOMException && coverErr.name === 'AbortError') {
          throw coverErr;
        }
        setUploadHint(
          mode === 'reuse' ? `已复用团队库视频；自动提取封面失败，请本地选图并裁剪` : `视频已入库：${videoLabel}；自动提取封面失败，请本地选图并裁剪`
        );
        setError(coverErr instanceof Error ? `自动提取封面失败：${coverErr.message}` : '自动提取封面失败，请本地选图并裁剪');
      }
      // 视频入库成功后直接进入发布规则（无步骤条）
      setStep(2);
      setRuleFocus(RULE_FOCUS_COMMON);
    } catch (err) {
      const cancelled = (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.message === '上传已取消');
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
      const cancelled = (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.message === '上传已取消');
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

  const onPickCover = (file: File | null, kind: CoverKind) => {
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
    const ref = kind === 'cover' ? coverPreviewUrl || coverUrl : coverLandscapePreviewUrl || coverLandscapeUrl;
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
        abort.signal
      );
      if (kind === 'cover') {
        setCoverUrl(asset.url);
      } else {
        setCoverLandscapeUrl(asset.url);
      }
      setUploadHint(kind === 'cover' ? '竖版封面已裁剪替换并入库' : '横版封面已裁剪替换并入库');
    } catch (err) {
      const cancelled = (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.message === '上传已取消');
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

  const activeDouyinSelected = selectedAccounts.filter(({ account }) => account.status === 'active').length;

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
      fix: publishBusy ? 'Agent 正忙于其它发布任务，请稍候' : connected ? '当前 Agent 无发布能力，请升级' : '需先连接 Agent',
      env: true,
    },
  ] as const;

  const publishBlocked = prechecks.some((item) => !item.ok);
  const firstBlock = prechecks.find((item) => !item.ok);
  // 门禁条已覆盖环境类阻塞时，底栏改展示摘要，避免与顶栏红字重复打架
  const showBottomBlock = firstBlock && (!firstBlock.env || firstBlock.id === 'accounts');
  const summaryText = [
    selectedAccounts.length > 0 ? `分发 ${selectedAccounts.length} 个账号` : '未选择分发账号',
    scheduleEnabled && scheduledLocal ? '定时发布' : '立即发布',
  ].join(' · ');

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const gateReady = connected && canPublish && activeAccounts.length > 0;
  const hasVideo = Boolean(videoUrl.trim());
  const coversReady = Boolean(coverUrl.trim() && coverLandscapeUrl.trim());
  const coverHint = !coversReady ? '竖/横封面未就绪：可重新上传视频自动截帧，或悬停封面选图裁剪' : '封面已就绪；移入可裁剪或替换本地图';

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <PageHeader>
        <PageHeaderTitle className="flex items-center gap-2">
          <Clapperboard className="size-5" />
          {editId ? '编辑视频' : '发布视频'}
        </PageHeaderTitle>
        <PageHeaderDescription>
          {step === 1 ? '选择要发布的视频' : '设置通用规则，并为各平台账号分别配置差异项'}
        </PageHeaderDescription>
      </PageHeader>

      {/* 选视频阶段不展示环境门禁，避免干扰 */}
      {step === 2 ? (
        <Alert variant={gateReady ? 'default' : 'destructive'}>
          {connected && canPublish && !publishBusy ? <CheckCircle2 /> : <Link2 />}
          <AlertTitle>环境检查</AlertTitle>
          <AlertDescription>
            <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>
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
              <span aria-hidden="true">·</span>
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
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>无法继续</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {uploadHint || publishHint ? (
        <Alert>
          <AlertTitle>{busyPhase === 'uploading' ? '上传进度' : '发布提示'}</AlertTitle>
          <AlertDescription>{publishHint || uploadHint}</AlertDescription>
          {busyPhase === 'uploading' ? (
            <AlertAction>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  cancelUpload();
                }}
              >
                取消上传
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      ) : null}

      {step === 1 ? (
        <VideoSelectStep
          videoSectionRef={videoSectionRef}
          videoInputRef={videoInputRef}
          hasVideo={hasVideo}
          videoFileName={videoFileName}
          videoFileSize={videoFileSize}
          dragOver={dragOver}
          disabled={loading || busy}
          onPickClick={() => {
            videoInputRef.current?.click();
          }}
          onFileChange={(file) => {
            void onPickVideo(file);
          }}
          onContinue={() => {
            setStep(2);
            setRuleFocus(RULE_FOCUS_COMMON);
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
        />
      ) : (
        <PublishRulesStep
          catalog={catalog}
          accounts={accounts}
          grouped={grouped}
          selected={selected}
          setSelected={setSelected}
          ruleFocus={ruleFocus}
          setRuleFocus={setRuleFocus}
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
          title={title}
          setTitle={setTitle}
          body={body}
          setBody={setBody}
          location={location}
          setLocation={setLocation}
          tags={tags}
          setTags={setTags}
          visibility={visibility}
          setVisibility={setVisibility}
          scheduleEnabled={scheduleEnabled}
          setScheduleEnabled={setScheduleEnabled}
          scheduledLocal={scheduledLocal}
          setScheduledLocal={setScheduledLocal}
          allowDownload={allowDownload}
          setAllowDownload={setAllowDownload}
          coverUrl={coverUrl}
          coverLandscapeUrl={coverLandscapeUrl}
          coverPreviewUrl={coverPreviewUrl}
          coverLandscapePreviewUrl={coverLandscapePreviewUrl}
          coverHint={coverHint}
          coverSectionRef={coverSectionRef}
          titleInputRef={titleInputRef}
          scheduleInputRef={scheduleInputRef}
          disabled={loading || busy}
          onCropCover={(kind) => {
            void onCropExistingCover(kind);
          }}
          onReplaceCover={(file, kind) => {
            onPickCover(file, kind);
          }}
          onAccountUpdated={(account) => {
            setAccounts((prev) => prev.map((item) => (item.id === account.id ? account : item)));
          }}
        />
      )}

      {step === 2 ? (
        <div className="sticky bottom-4 z-10">
          <div className="flex flex-col gap-2 rounded-lg border bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 truncate text-muted-foreground">
              {publishBlocked && showBottomBlock && firstBlock ? (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto max-w-full justify-start truncate p-0 text-left text-destructive"
                  onClick={() => {
                    onBottomBlockActivate();
                  }}
                >
                  {firstBlock.fix}
                </Button>
              ) : (
                summaryText
              )}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                disabled={busy || loading}
                onClick={() => {
                  setStep(1);
                }}
              >
                <Video data-icon="inline-start" />
                更换视频
              </Button>
              <Button
                variant="outline"
                disabled={busy || loading}
                onClick={() => {
                  void submit('draft');
                }}
              >
                {busyPhase === 'saving' ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                {busyPhase === 'saving' ? '保存中…' : '存草稿'}
              </Button>
              <Button
                disabled={busy || loading || publishBlocked}
                onClick={() => {
                  void submit('published');
                }}
              >
                {busy && busyPhase !== 'idle' ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                {busy && busyPhase !== 'idle' ? primaryBusyLabel : '推送到抖音'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
                if (prev !== coverPreviewUrl && prev !== coverLandscapePreviewUrl) {
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
