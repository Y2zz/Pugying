import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, FileText } from 'lucide-react';
import {
  PageHeader,
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
import { useAgent } from '@/hooks/use-agent';
import { agentClient } from '@/lib/agent-client';
import {
  createContent,
  completeContentTarget,
  fetchContent,
  fetchCoverObjectUrl,
  fetchPlatformAccounts,
  fetchPlatformCatalog,
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
import {
  PublishVideoActionBar,
  type PrecheckItem,
} from './publish-video/PublishVideoFormPanel';
import {
  PublishVideoProgressPanel,
  parseActivePublishAccountLabel,
} from './publish-video/PublishVideoProgressPanel';
import { PublishArticleFormPanel } from './publish-article/PublishArticleFormPanel';
import {
  LOCAL_PATH_MISSING_IMAGE,
  ARTICLE_BODY_MAX,
  ARTICLE_BODY_MIN,
  articleBodyPlainLength,
  checkLocalPathsReadable,
  deriveArticlePublishFlowStep,
  describeArticlePublishFlowStep,
  draftFromTargetAndContent,
  draftToOverrides,
  emptyDraft,
  extractLocalImagePathsFromHtml,
  htmlToPlainText,
  looksUnstableLocalPath,
  summarizeSelectedAccountIssues,
  validateSchedule,
  type BusyPhase,
  type CoverKind,
  type OverrideDraft,
} from './publish-article/helpers';

export default function PublishArticle() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const { connected, publishBusy, canPublish, status: agentStatus } = useAgent();

  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [publishHint, setPublishHint] = useState('');
  const [accountFocusNonce, setAccountFocusNonce] = useState(0);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaPaths, setMediaPaths] = useState<string[]>([]);
  const [pathWarning, setPathWarning] = useState('');
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [hasCover, setHasCover] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverSourceUrl, setCoverSourceUrl] = useState<string | null>(null);
  const [editCoverOpen, setEditCoverOpen] = useState(false);
  const [editCoverAspect] = useState<EditCoverAspect>('portrait');
  const [editCoverInitialSource, setEditCoverInitialSource] = useState<string | null>(null);
  const [editCoverScope, setEditCoverScope] = useState<'common' | { accountId: string }>('common');

  const [accounts, setAccounts] = useState<PlatformAccountItem[]>([]);
  const [catalog, setCatalog] = useState<PlatformCatalogItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, OverrideDraft>>({});

  const [busyPhase, setBusyPhase] = useState<BusyPhase>('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const coverSectionRef = useRef<HTMLDivElement>(null);
  const accountsSectionRef = useRef<HTMLDivElement>(null);
  const bodySectionRef = useRef<HTMLDivElement>(null);

  const [createdContentId, setCreatedContentId] = useState<string | null>(null);
  const [contentStatus, setContentStatus] = useState<ContentStatus | null>(null);
  const ownedContentId = editId ?? createdContentId;

  const revokePreview = (url: string | null | undefined) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  const coverSessionBlobsRef = useRef({
    coverPreviewUrl: null as string | null,
    coverSourceUrl: null as string | null,
    drafts: {} as Record<string, OverrideDraft>,
  });
  coverSessionBlobsRef.current = {
    coverPreviewUrl,
    coverSourceUrl,
    drafts,
  };
  useEffect(() => {
    return () => {
      const snap = coverSessionBlobsRef.current;
      revokePreview(snap.coverPreviewUrl);
      revokePreview(snap.coverSourceUrl);
      for (const draft of Object.values(snap.drafts)) {
        revokePreview(draft.coverPreviewUrl);
        revokePreview(draft.coverSourceUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginBusy = (phase: BusyPhase) => {
    setBusyPhase(phase);
  };

  const endBusy = () => {
    setBusyPhase('idle');
  };

  const refreshPathWarning = async (paths: string[]) => {
    if (paths.length === 0) {
      setPathWarning('');
      return;
    }
    const readable = await checkLocalPathsReadable(paths);
    if (!readable) {
      setPathWarning(LOCAL_PATH_MISSING_IMAGE);
    } else if (paths.some((p) => looksUnstableLocalPath(p))) {
      setPathWarning(
        '正文中的图片路径位于外置盘或网盘同步目录，文件变动后可能导致发布失败，建议复制到本机固定目录后再插入。',
      );
    } else {
      setPathWarning('发布依赖正文中的本机图片路径；请勿移动或删除这些文件。');
    }
  };

  const mergeMediaPaths = (incoming: string[]) => {
    setMediaPaths((prev) => {
      const merged = [...prev];
      for (const path of incoming) {
        if (!merged.includes(path)) {
          merged.push(path);
        }
      }
      void refreshPathWarning(merged);
      return merged;
    });
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
          const fromHtml = extractLocalImagePathsFromHtml(item.body ?? '');
          const paths =
            fromHtml.length > 0 ? fromHtml : (item.mediaPaths ?? []);
          setMediaPaths(paths);
          await refreshPathWarning(paths);
          if (cancelled) {
            return;
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
              /* 封面拉取失败时仍保留 hasCover */
            }
          }
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
            nextDrafts[target.platformAccountId] = draft;
          }
          if (cancelled) {
            for (const draft of Object.values(nextDrafts)) {
              revokePreview(draft.coverPreviewUrl);
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

  // 正文变更时同步插图路径（删除正文中的图也会反映到 mediaPaths）
  useEffect(() => {
    const fromHtml = extractLocalImagePathsFromHtml(body);
    if (fromHtml.length === 0 && mediaPaths.length === 0) {
      return;
    }
    const same =
      fromHtml.length === mediaPaths.length &&
      fromHtml.every((p, i) => p === mediaPaths[i]);
    if (same) {
      return;
    }
    setMediaPaths(fromHtml);
    void refreshPathWarning(fromHtml);
    // 仅随 body 驱动；mediaPaths 比较避免环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

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
    selectedAccounts.map(({ account }) => {
      const draft = getDraft(account.id);
      const overrides = draftToOverrides(draft);
      // 账号覆盖描述若含 HTML，推送前压成纯文本（抖音图文不吃富文本）
      if (overrides.body) {
        overrides.body = htmlToPlainText(overrides.body) || overrides.body;
      }
      return {
        platformAccountId: account.id,
        overrides,
      };
    });

  const focusPrecheck = (item: PrecheckItem) => {
    const scroll = (el: HTMLElement | null) => {
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    switch (item.focusKind) {
      case 'images':
      case 'body':
        window.setTimeout(() => {
          scroll(bodySectionRef.current);
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
            setAccountFocusNonce((n) => n + 1);
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

  const uploadPendingCovers = async (saved: ContentItem) => {
    let next = saved;
    if (coverBlob) {
      next = await uploadContentCover(saved.id, 'portrait', coverBlob, 'cover.jpg');
      setCoverBlob(null);
      setHasCover(true);
    }

    const updatedDrafts: Record<string, OverrideDraft> = { ...drafts };
    for (const target of next.targets) {
      const draft = updatedDrafts[target.platformAccountId] ?? getDraft(target.platformAccountId);
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
      } else if (!updatedDrafts[target.platformAccountId]) {
        updatedDrafts[target.platformAccountId] = draft;
      }
    }
    setDrafts(updatedDrafts);
    return next;
  };

  const resolvedMediaPaths = () => {
    const fromHtml = extractLocalImagePathsFromHtml(body);
    return fromHtml.length > 0 ? fromHtml : mediaPaths;
  };

  const submit = async (status: ContentStatus) => {
    if (!title.trim()) {
      setError('请填写标题');
      focusBlock('title');
      return;
    }
    const bodyLen = articleBodyPlainLength(body);
    if (status === 'published' && bodyLen < ARTICLE_BODY_MIN) {
      setError(`正文至少 ${ARTICLE_BODY_MIN} 字（当前 ${bodyLen}）`);
      focusBlock('body');
      return;
    }
    if (bodyLen > ARTICLE_BODY_MAX) {
      setError(`正文最多 ${ARTICLE_BODY_MAX.toLocaleString('zh-CN')} 字`);
      focusBlock('body');
      return;
    }
    const paths = resolvedMediaPaths();
    if (status === 'published' && paths.length === 0) {
      setError('发布前请在正文中插入至少一张本机图片');
      focusBlock('images');
      return;
    }
    if (status === 'published' && !coverReady) {
      setError('发布前请上传并裁剪竖版封面（3:4）');
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
        setError('应用未就绪，请重启「蒲公英」后再发布。');
        focusBlock('agent');
        return;
      }
      if (!agentClient.getHello()?.capabilities.includes('platform.publish.start')) {
        setError('当前版本无发布能力，请升级蒲公英');
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
      mediaPaths: paths,
      tags: [],
      visibility: 'public' as const,
      allowDownload: true,
      targets: buildTargets(),
      ...(contentStatus === 'published' ? {} : { status: 'draft' as ContentStatus }),
    };
    let contentId = ownedContentId;
    try {
      let saved: ContentItem;
      if (contentId) {
        saved = await updateContent(contentId, payload);
      } else {
        saved = await createContent({ type: 'article', ...payload });
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

      setPublishHint('正在提交发布任务…');
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
            contentType: live.contentType ?? 'article',
            mediaPath: live.mediaPath,
            mediaPaths: live.mediaPaths,
            coverPath: live.coverPath,
            coverLandscapePath: live.coverLandscapePath || undefined,
            title: live.title,
            // 抖音图文填写区用纯文本
            body: htmlToPlainText(live.body ?? '') || live.body,
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
          void navigate(`/publish/article?id=${contentId}`, { replace: true });
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
        void navigate(`/publish/article?id=${contentId}`, { replace: true });
      }
      endBusy();
      setPublishHint('');
    }
  };

  const openEditCover = (scope: 'common' | { accountId: string } = 'common') => {
    // 封面以用户上传+裁剪为主：仅沿用本会话已有源图/裁切图，不自动用正文插图顶替
    let sourceCandidate: string | null = null;
    let croppedFallback: string | null = null;
    if (scope === 'common') {
      sourceCandidate = coverSourceUrl;
      croppedFallback = coverPreviewUrl;
    } else {
      const draft = getDraft(scope.accountId);
      sourceCandidate = draft.coverSourceUrl || null;
      croppedFallback = draft.coverPreviewUrl || coverPreviewUrl;
    }
    const initialSource = sourceCandidate?.trim() || croppedFallback?.trim() || null;
    setEditCoverInitialSource(initialSource);
    setEditCoverScope(scope);
    setEditCoverOpen(true);
    setError('');
  };

  const onEditCoverSaved = (result: EditCoverSavedResult) => {
    const previewUrl = URL.createObjectURL(result.croppedFile);
    const replaceSessionUrl = (prev: string | null | undefined, next: string) => {
      if (prev && prev !== next) {
        revokePreview(prev);
      }
      return next;
    };
    if (editCoverScope === 'common') {
      setCoverSourceUrl((prev) => replaceSessionUrl(prev, result.sourceUrl));
      setCoverBlob(result.croppedFile);
      setHasCover(false);
      setCoverPreviewUrl((prev) => replaceSessionUrl(prev, previewUrl));
    } else {
      const accountId = editCoverScope.accountId;
      const draft = getDraft(accountId);
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
    }
    toast.add({ type: 'success', title: '竖版封面已保存' });
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

  const bodyLen = articleBodyPlainLength(body);
  const bodyReady =
    bodyLen >= ARTICLE_BODY_MIN && bodyLen <= ARTICLE_BODY_MAX;

  const checklistItems: PrecheckItem[] = [
    {
      id: 'title',
      label: '标题',
      ok: Boolean(title.trim()),
      fix: '请填写标题',
      focusKind: 'title',
    },
    {
      id: 'body',
      label: '正文',
      ok: bodyReady,
      fix:
        bodyLen > ARTICLE_BODY_MAX
          ? `正文最多 ${ARTICLE_BODY_MAX.toLocaleString('zh-CN')} 字`
          : `正文至少 ${ARTICLE_BODY_MIN} 字（当前 ${bodyLen}）`,
      focusKind: 'body',
    },
    {
      id: 'images',
      label: '配图',
      ok: resolvedMediaPaths().length > 0,
      fix: '请在正文工具栏插入至少一张本机图片',
      focusKind: 'images',
    },
    {
      id: 'cover',
      label: '竖封面',
      ok: coverReady,
      fix: '请上传图片并裁剪竖版封面（3:4）',
      focusKind: 'cover',
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
      label: '发布能力',
      ok: connected && canPublish,
      fix:
        agentStatus === 'connecting' ? (
          '应用正在就绪…'
        ) : publishBusy ? (
          '正有其它发布任务进行中，请稍候'
        ) : connected ? (
          '当前版本无发布能力，请升级'
        ) : (
          <span>应用未就绪，请重启后再试</span>
        ),
      env: true,
      focusKind: 'agent',
    },
  ];

  const publishBlocked = checklistItems.some((item) => !item.ok);
  const readyCount = checklistItems.filter((item) => item.ok).length;
  const formLocked = loading || busyPhase === 'saving' || busyPhase === 'publishing';

  const flowStep = deriveArticlePublishFlowStep({
    loading,
    busyPhase,
    publishHint,
  });
  const showPublishPanel = flowStep === 'publish' || flowStep === 'progress';
  const publishProgressAccounts = selectedAccounts
    .filter(({ account }) => account.status === 'active')
    .map(({ account }) => ({ id: account.id, displayName: account.displayName }));
  const activePublishAccountLabel = parseActivePublishAccountLabel(publishHint);

  const primaryBusyLabel =
    busyPhase === 'saving'
      ? '保存中…'
      : busyPhase === 'publishing'
        ? '发布中…'
        : '处理中…';

  const coverHint = !coverReady
    ? '点击槽位上传图片并裁剪为竖版 3:4'
    : '封面已就绪；点击可重新上传或调整裁剪';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderTitle className="flex items-center gap-2">
          <FileText className="size-5" />
          {editId ? '编辑图文' : '发布图文'}
        </PageHeaderTitle>
        <PageHeaderDescription>
          {describeArticlePublishFlowStep(flowStep)}
        </PageHeaderDescription>
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
          variant={pathWarning === LOCAL_PATH_MISSING_IMAGE ? 'destructive' : 'default'}
        >
          <AlertCircle />
          <AlertTitle>
            {pathWarning === LOCAL_PATH_MISSING_IMAGE ? '源文件不可用' : '本机路径依赖'}
          </AlertTitle>
          <AlertDescription>{pathWarning}</AlertDescription>
        </Alert>
      ) : null}

      {showPublishPanel ? (
        <PublishVideoProgressPanel
          flowStep={flowStep}
          publishHint={publishHint}
          accounts={publishProgressAccounts}
          activeAccountLabel={activePublishAccountLabel}
        />
      ) : (
        <div ref={bodySectionRef}>
          <PublishArticleFormPanel
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
            onImagesInserted={(paths) => {
              mergeMediaPaths(paths);
            }}
            coverReady={coverReady}
            coverPreviewUrl={coverPreviewUrl}
            coverHint={coverHint}
            onEditCover={(_kind: CoverKind) => {
              openEditCover('common');
            }}
            onEditAccountCover={(accountId) => {
              openEditCover({ accountId });
            }}
            titleInputRef={titleInputRef}
            disabled={formLocked}
          />
        </div>
      )}

      {!showPublishPanel ? (
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
        videoUrl={null}
        initialSourceUrl={editCoverInitialSource}
        initialFrameTime={null}
        onOpenChange={(open) => {
          setEditCoverOpen(open);
          if (!open) {
            setEditCoverInitialSource((prev) => {
              if (
                prev?.startsWith('blob:') &&
                prev !== coverPreviewUrl &&
                prev !== coverSourceUrl
              ) {
                URL.revokeObjectURL(prev);
              }
              return null;
            });
          }
        }}
        onSaved={onEditCoverSaved}
      />
    </div>
  );
}
