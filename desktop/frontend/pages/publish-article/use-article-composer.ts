import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EditCoverSavedResult } from '@/components/EditCoverDialog';
import { toast } from '@/components/AppToaster';
import {
  createContent,
  fetchContent,
  fetchCoverObjectUrl,
  fetchPlatformAccounts,
  fetchPlatformCatalog,
  updateContent,
  uploadContentCover,
  type ContentItem,
  type ContentStatus,
  type CoverKind,
  type PlatformAccountItem,
  type PlatformCatalogItem,
  type PlatformId,
} from '@/lib/api';
import { describeCaughtError } from '@/lib/publish-errors';
import {
  ARTICLE_SUPPORTED_PLATFORMS,
  articleCoverAspects,
  intersectArticleBodyLimits,
  intersectArticleTitleMax,
  isArticleCoverRequired,
  isArticleSupportedPlatform,
} from './article-platform-fields';
import {
  COVER_ASPECTS,
  articleBodyPlainLength,
  articleDraftToOverrides,
  checkLocalPathsReadable,
  coverSlotReady,
  draftFromTarget,
  emptyArticleDraft,
  emptyCoverPair,
  extractLocalImagePathsFromHtml,
  getArticleAccountDraftIssues,
  localPathToFileUrl,
  looksUnstableLocalPath,
  missingRequiredCovers,
  type ArticleOverrideDraft,
  type CoverPair,
  type CoverSlot,
} from './helpers';

export interface ArticleRosterEntry {
  account: PlatformAccountItem;
  platformLabel: string;
}

export type ArticleCheckId = 'title' | 'body' | 'images' | 'cover' | 'accounts' | 'accountConfig';

export interface ArticleCheck {
  id: ArticleCheckId;
  label: string;
  ok: boolean;
  detail: string;
  /** accountConfig：第一个有问题的账号，便于直接打开其设置 */
  accountId?: string;
}

export type CoverScope = 'common' | { accountId: string };

export interface CoverNeed {
  aspect: CoverKind;
  required: boolean;
  /** 用到该比例的已选平台名 */
  platformLabels: string[];
}

export type PathWarning = { tone: 'error' | 'warning'; text: string } | null;

/**
 * 文章发布页的全部状态与动作：载入、账号选择、账号草稿、封面、检查项与保存。
 * 页面组件只负责布局与聚焦。
 */
export function useArticleComposer(editId: string | null) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState<{ id: ArticleCheckId; text: string } | null>(
    null,
  );

  const [catalog, setCatalog] = useState<PlatformCatalogItem[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccountItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, ArticleOverrideDraft>>({});

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  /** 旧数据正文里可能没有 data-local-path，此时退回服务端记录的 mediaPaths */
  const [legacyMediaPaths, setLegacyMediaPaths] = useState<string[]>([]);
  const [covers, setCovers] = useState<CoverPair>(emptyCoverPair);
  const [pathWarning, setPathWarning] = useState<PathWarning>(null);

  const [createdContentId, setCreatedContentId] = useState<string | null>(null);
  const [contentStatus, setContentStatus] = useState<ContentStatus | null>(null);
  const ownedContentId = editId ?? createdContentId;

  const [coverEditor, setCoverEditor] = useState<{
    open: boolean;
    aspect: CoverKind;
    scope: CoverScope;
    initialSource: string | null;
  }>({ open: false, aspect: 'portrait', scope: 'common', initialSource: null });

  // 会话内创建的 blob: URL 统一登记，卸载时释放；替换时不立即 revoke，避免仍在预览的图片失效
  const blobUrlsRef = useRef(new Set<string>());
  const trackUrl = useCallback((url: string) => {
    if (url.startsWith('blob:')) {
      blobUrlsRef.current.add(url);
    }
    return url;
  }, []);
  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [platforms, accountList] = await Promise.all([
          fetchPlatformCatalog(),
          fetchPlatformAccounts(),
        ]);
        if (cancelled) {
          return;
        }
        const articleAccounts = accountList.filter((a) => isArticleSupportedPlatform(a.platform));
        setCatalog(platforms.filter((p) => isArticleSupportedPlatform(p.id)));
        setAccounts(articleAccounts);

        if (!editId) {
          const active = articleAccounts.filter((a) => a.status === 'active');
          if (active.length === 1) {
            setSelected({ [active[0].id]: true });
          }
          return;
        }

        const item = await fetchContent(editId);
        if (cancelled) {
          return;
        }
        setTitle(item.title);
        setBody(item.body ?? '');
        setLegacyMediaPaths(item.mediaPaths ?? []);
        setContentStatus(item.status);

        const nextCovers = emptyCoverPair();
        for (const aspect of COVER_ASPECTS) {
          const has = aspect === 'portrait' ? item.hasCover : item.hasCoverLandscape;
          if (!has) {
            continue;
          }
          nextCovers[aspect].saved = true;
          try {
            nextCovers[aspect].previewUrl = trackUrl(await fetchCoverObjectUrl(item.id, aspect));
          } catch {
            /* 预览失败不影响「已有封面」状态 */
          }
        }

        const nextSelected: Record<string, boolean> = {};
        const nextDrafts: Record<string, ArticleOverrideDraft> = {};
        for (const target of item.targets) {
          if (!isArticleSupportedPlatform(target.platform)) {
            continue;
          }
          nextSelected[target.platformAccountId] = true;
          const draft = draftFromTarget(target.overrides, item);
          for (const aspect of COVER_ASPECTS) {
            const has = aspect === 'portrait' ? target.hasCover : target.hasCoverLandscape;
            if (has) {
              draft.covers[aspect] = await loadTargetCover(item.id, aspect, target.id, trackUrl);
            }
          }
          nextDrafts[target.platformAccountId] = draft;
        }
        if (cancelled) {
          return;
        }
        setCovers(nextCovers);
        setSelected(nextSelected);
        setDrafts(nextDrafts);
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
  }, [editId, trackUrl]);

  const htmlMediaPaths = useMemo(() => extractLocalImagePathsFromHtml(body), [body]);
  const mediaPaths = htmlMediaPaths.length > 0 ? htmlMediaPaths : legacyMediaPaths;
  const mediaPathsKey = mediaPaths.join('\n');

  useEffect(() => {
    let cancelled = false;
    const paths = mediaPathsKey ? mediaPathsKey.split('\n') : [];
    const check = async () => {
      if (paths.length === 0) {
        setPathWarning(null);
        return;
      }
      const readable = await checkLocalPathsReadable(paths);
      if (cancelled) {
        return;
      }
      if (!readable) {
        setPathWarning({ tone: 'error', text: '有图片找不到了，请删除后重新插入' });
      } else if (paths.some((p) => looksUnstableLocalPath(p))) {
        setPathWarning({
          tone: 'warning',
          text: '部分图片在外置盘或网盘目录里，移动后将无法发布',
        });
      } else {
        setPathWarning(null);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [mediaPathsKey]);

  const entries = useMemo<ArticleRosterEntry[]>(() => {
    const order = catalog.length > 0 ? catalog.map((c) => c.id) : [...ARTICLE_SUPPORTED_PLATFORMS];
    const label = (id: PlatformId) => catalog.find((c) => c.id === id)?.displayName ?? id;
    return order.flatMap((platform) =>
      accounts
        .filter((account) => account.platform === platform && selected[account.id])
        .map((account) => ({ account, platformLabel: label(platform) })),
    );
  }, [accounts, catalog, selected]);

  const platformLabel = useCallback(
    (id: PlatformId) => catalog.find((c) => c.id === id)?.displayName ?? id,
    [catalog],
  );

  const selectedPlatforms = useMemo(
    () => [...new Set(entries.map((e) => e.account.platform))],
    [entries],
  );
  const titleMax = intersectArticleTitleMax(selectedPlatforms);
  const bodyLimits = intersectArticleBodyLimits(selectedPlatforms);

  const coverNeeds = useMemo<CoverNeed[]>(() => {
    if (selectedPlatforms.length === 0) {
      return COVER_ASPECTS.map((aspect) => ({ aspect, required: false, platformLabels: [] }));
    }
    return COVER_ASPECTS.flatMap((aspect) => {
      const using = selectedPlatforms.filter((p) => articleCoverAspects(p).includes(aspect));
      if (using.length === 0) {
        return [];
      }
      return [
        {
          aspect,
          required: using.some((p) => isArticleCoverRequired(p, aspect)),
          platformLabels: using.map(platformLabel),
        },
      ];
    });
  }, [selectedPlatforms, platformLabel]);

  const getDraft = useCallback(
    (accountId: string) => drafts[accountId] ?? emptyArticleDraft(),
    [drafts],
  );

  const setDraft = useCallback((accountId: string, draft: ArticleOverrideDraft) => {
    setDrafts((prev) => ({ ...prev, [accountId]: draft }));
  }, []);

  const applyPatch = useCallback(
    (accountIds: string[], patch: Partial<ArticleOverrideDraft>) => {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of accountIds) {
          next[id] = { ...(prev[id] ?? emptyArticleDraft()), ...patch };
        }
        return next;
      });
    },
    [],
  );

  const removeAccounts = useCallback((accountIds: string[]) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const id of accountIds) {
        delete next[id];
      }
      return next;
    });
  }, []);

  const activeEntries = useMemo(
    () => entries.filter((e) => e.account.status === 'active'),
    [entries],
  );

  const accountIssues = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { account } of entries) {
      if (account.status !== 'active') {
        continue;
      }
      const issues = getArticleAccountDraftIssues(getDraft(account.id), account.platform);
      if (issues.length > 0) {
        map.set(account.id, issues);
      }
    }
    return map;
  }, [entries, getDraft]);

  const bodyLength = articleBodyPlainLength(body);
  const titleLength = title.trim().length;

  const checks = useMemo<ArticleCheck[]>(() => {
    const list: ArticleCheck[] = [];
    list.push({
      id: 'title',
      label: '标题',
      ok: titleLength > 0 && titleLength <= titleMax,
      detail:
        titleLength === 0
          ? '未填写'
          : titleLength > titleMax
            ? `超出 ${titleLength - titleMax} 字`
            : `${titleLength} 字`,
    });
    list.push({
      id: 'body',
      label: '正文',
      ok: bodyLength >= bodyLimits.min && bodyLength <= bodyLimits.max,
      detail:
        bodyLength === 0
          ? '未填写'
          : bodyLength < bodyLimits.min
            ? `还差 ${bodyLimits.min - bodyLength} 字`
            : bodyLength > bodyLimits.max
              ? `超出 ${(bodyLength - bodyLimits.max).toLocaleString('zh-CN')} 字`
              : `${bodyLength.toLocaleString('zh-CN')} 字`,
    });
    list.push({
      id: 'images',
      label: '配图',
      ok: pathWarning?.tone !== 'error',
      detail:
        mediaPaths.length === 0
          ? '可选，插入本机图片'
          : pathWarning?.tone === 'error'
            ? '有图片不可用'
            : `${mediaPaths.length} 张`,
    });
    const missing = new Set<CoverKind>();
    for (const { account } of activeEntries) {
      for (const aspect of missingRequiredCovers(getDraft(account.id), covers, account.platform)) {
        missing.add(aspect);
      }
    }
    // 未选账号时无从判断比例要求，只要设过任一通用封面即视为完成
    const anyCommonCover = COVER_ASPECTS.some((aspect) => coverSlotReady(covers[aspect]));
    const coverOk = activeEntries.length === 0 ? anyCommonCover : missing.size === 0;
    list.push({
      id: 'cover',
      label: '封面',
      ok: coverOk,
      detail: coverOk
        ? '已设置'
        : missing.size > 0
          ? `缺少${[...missing].map((a) => (a === 'portrait' ? '竖版' : '横版')).join('、')}封面`
          : '未设置',
    });
    list.push({
      id: 'accounts',
      label: '分发账号',
      ok: activeEntries.length > 0,
      detail: activeEntries.length > 0 ? `${activeEntries.length} 个账号` : '尚未选择',
    });
    if (activeEntries.length > 0) {
      const firstIssue = [...accountIssues.keys()][0];
      list.push({
        id: 'accountConfig',
        label: '账号设置',
        ok: accountIssues.size === 0,
        detail: accountIssues.size === 0 ? '无问题' : `${accountIssues.size} 个账号需调整`,
        accountId: firstIssue,
      });
    }
    return list;
  }, [
    titleLength,
    titleMax,
    bodyLength,
    bodyLimits,
    mediaPaths.length,
    pathWarning,
    activeEntries,
    getDraft,
    covers,
    accountIssues,
  ]);

  /** 仅硬性错误阻止保存草稿；缺图、缺封面等可先存再补 */
  const blockingCheck = useMemo<ArticleCheck | null>(() => {
    if (titleLength === 0 || titleLength > titleMax) {
      return checks.find((c) => c.id === 'title') ?? null;
    }
    if (bodyLength > bodyLimits.max) {
      return checks.find((c) => c.id === 'body') ?? null;
    }
    if (accountIssues.size > 0) {
      return checks.find((c) => c.id === 'accountConfig') ?? null;
    }
    return null;
  }, [titleLength, titleMax, bodyLength, bodyLimits.max, accountIssues, checks]);

  const openCoverEditor = useCallback(
    (aspect: CoverKind, scope: CoverScope = 'common', sourceOverride?: string) => {
      let initialSource: string | null = sourceOverride ?? null;
      if (!initialSource) {
        const common = covers[aspect];
        if (scope === 'common') {
          initialSource = common.sourceUrl || common.previewUrl || null;
        } else {
          const own = getDraft(scope.accountId).covers[aspect];
          initialSource = own.sourceUrl || own.previewUrl || common.previewUrl || null;
        }
      }
      setCoverEditor({ open: true, aspect, scope, initialSource });
    },
    [covers, getDraft],
  );

  const closeCoverEditor = useCallback(() => {
    setCoverEditor((prev) => ({ ...prev, open: false }));
  }, []);

  const onCoverSaved = useCallback(
    (result: EditCoverSavedResult) => {
      const slot: CoverSlot = {
        blob: result.croppedFile,
        previewUrl: trackUrl(URL.createObjectURL(result.croppedFile)),
        sourceUrl: trackUrl(result.sourceUrl),
        saved: false,
      };
      const { aspect, scope } = coverEditor;
      if (scope === 'common') {
        setCovers((prev) => ({ ...prev, [aspect]: slot }));
      } else {
        setDrafts((prev) => {
          const draft = prev[scope.accountId] ?? emptyArticleDraft();
          return {
            ...prev,
            [scope.accountId]: { ...draft, covers: { ...draft.covers, [aspect]: slot } },
          };
        });
      }
    },
    [coverEditor, trackUrl],
  );

  const firstImagePath = mediaPaths[0] ?? null;

  /** 用正文首图作为缺失的通用封面（优先必需且未设置的比例） */
  const applyFirstImageAsCover = useCallback(() => {
    if (!firstImagePath) {
      return;
    }
    const target =
      coverNeeds.find((n) => n.required && !coverSlotReady(covers[n.aspect])) ??
      coverNeeds.find((n) => !coverSlotReady(covers[n.aspect])) ??
      coverNeeds[0];
    if (target) {
      openCoverEditor(target.aspect, 'common', localPathToFileUrl(firstImagePath));
    }
  }, [firstImagePath, coverNeeds, covers, openCoverEditor]);

  // 校验提示在问题被修正后自动消失；请求失败的提示保留到下次保存
  useEffect(() => {
    if (!blockingCheck || blockingCheck.id !== validationError?.id) {
      setValidationError(null);
    }
  }, [blockingCheck, validationError?.id]);

  /** 保存草稿；被硬性问题拦下时返回对应检查项，由页面负责聚焦 */
  const save = useCallback(async (): Promise<ArticleCheck | null> => {
    if (blockingCheck) {
      setValidationError({
        id: blockingCheck.id,
        text:
          blockingCheck.id === 'accountConfig'
            ? '有账号设置需要调整'
            : `${blockingCheck.label}${blockingCheck.detail}`,
      });
      return blockingCheck;
    }
    setSaving(true);
    setError('');
    const payload = {
      title: title.trim(),
      body: body.trim(),
      mediaPaths,
      tags: [],
      visibility: 'public' as const,
      allowDownload: true,
      targets: entries.map(({ account }) => ({
        platformAccountId: account.id,
        overrides: articleDraftToOverrides(getDraft(account.id), account.platform),
      })),
      ...(contentStatus === 'published' ? {} : { status: 'draft' as ContentStatus }),
    };
    try {
      let saved: ContentItem;
      if (ownedContentId) {
        saved = await updateContent(ownedContentId, payload);
      } else {
        saved = await createContent({ type: 'article', ...payload });
        setCreatedContentId(saved.id);
      }
      for (const aspect of COVER_ASPECTS) {
        const blob = covers[aspect].blob;
        if (blob) {
          saved = await uploadContentCover(saved.id, aspect, blob, `cover-${aspect}.jpg`);
        }
      }
      setCovers((prev) => ({
        portrait: prev.portrait.blob ? { ...prev.portrait, blob: null, saved: true } : prev.portrait,
        landscape: prev.landscape.blob
          ? { ...prev.landscape, blob: null, saved: true }
          : prev.landscape,
      }));
      // Target 每次保存都会重建，账号封面需整体重传
      for (const target of saved.targets) {
        const draft = drafts[target.platformAccountId];
        if (!draft) {
          continue;
        }
        const aspects = isArticleSupportedPlatform(target.platform)
          ? articleCoverAspects(target.platform)
          : [];
        for (const aspect of aspects) {
          const blob = draft.covers[aspect].blob;
          if (blob) {
            await uploadContentCover(saved.id, aspect, blob, `cover-${aspect}.jpg`, target.id);
          }
        }
      }
      setContentStatus(saved.status);
      toast.add({ type: 'success', title: '已保存' });
      void navigate('/contents');
      return null;
    } catch (err) {
      setError(describeCaughtError(err, '保存失败'));
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    blockingCheck,
    title,
    body,
    mediaPaths,
    entries,
    getDraft,
    contentStatus,
    ownedContentId,
    covers,
    drafts,
    navigate,
  ]);

  return {
    loading,
    saving,
    error: validationError?.text || error,
    catalog,
    accounts,
    selected,
    setSelected,
    entries,
    platformLabel,
    drafts,
    getDraft,
    setDraft,
    applyPatch,
    removeAccounts,
    accountIssues,
    title,
    setTitle,
    titleMax,
    body,
    setBody,
    bodyLimits,
    mediaPaths,
    pathWarning,
    covers,
    coverNeeds,
    coverEditor,
    openCoverEditor,
    closeCoverEditor,
    onCoverSaved,
    firstImagePath,
    applyFirstImageAsCover,
    checks,
    blockingCheck,
    save,
    isEditing: Boolean(editId),
  };
}

export type ArticleComposer = ReturnType<typeof useArticleComposer>;

async function loadTargetCover(
  contentId: string,
  aspect: CoverKind,
  targetId: string,
  trackUrl: (url: string) => string,
): Promise<CoverSlot> {
  try {
    const previewUrl = trackUrl(await fetchCoverObjectUrl(contentId, aspect, targetId));
    const blob = await (await fetch(previewUrl)).blob();
    return { blob, previewUrl, sourceUrl: '', saved: false };
  } catch {
    return { blob: null, previewUrl: '', sourceUrl: '', saved: false };
  }
}
