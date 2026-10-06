import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertCircle, Send } from "lucide-react";
import { toast } from "@/components/AppToaster";
import { ArticleCoverEditDialog } from "./publish-article/ArticleCoverEditDialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ArticleRecoveryDialog } from "./publish-article/ArticleRecoveryDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AddAccountsDialog } from "./publish-video/AddAccountsDialog";
import { ArticleBulkEditDialog } from "./publish-article/ArticleBulkEditDialog";
import { ArticlePageHeader } from "./publish-article/ArticlePageHeader";
import { ArticleCoverCard } from "./publish-article/ArticleCoverCard";
import { ArticleDistributionPanel } from "./publish-article/ArticleDistributionPanel";
import { ArticleDocument } from "./publish-article/ArticleDocument";
import { scrollToArticleField } from "./publish-article/scroll-to-article-field";
import {
  useArticleComposer,
  type ArticleCheck,
} from "./publish-article/use-article-composer";

/**
 * 文章发布页单列主流程（顺序有意如此）：
 * 1. 内容（标题/富文本正文）——创作主路径
 * 2. 通用封面——先定默认，再允许账号覆盖；槽位随已选平台动态收紧
 * 3. 分发账号——名单 + 同屏表单
 * 发布检查挂在页头贴近「保存」，不当作中间步骤。
 */
export default function PublishArticle() {
  const [params] = useSearchParams();
  const id = params.get("id");
  return <ArticleComposerPage key={id || "new"} editId={id} />;
}

function ArticleComposerPage({ editId }: { editId: string | null }) {
  const composer = useArticleComposer(editId);
  const { loading, saving, entries, checks, covers, getDraft } = composer;

  const [publishAttempted, setPublishAttempted] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [focusedAccountId, setFocusedAccountId] = useState<string | null>(null);
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const imageWarningRef = useRef<HTMLDivElement>(null);
  const coverSectionRef = useRef<HTMLElement>(null);
  const accountsSectionRef = useRef<HTMLDivElement>(null);

  const locked = loading || saving;
  const accountsEmpty = !loading && composer.accounts.length === 0;
  const pending = checks.filter((c) => !c.ok).length;

  const focusCheck = (check: ArticleCheck) => {
    switch (check.id) {
      case "title":
        titleRef.current?.focus({ preventScroll: true });
        scrollToArticleField(titleRef.current);
        break;
      case "body":
        editorRef.current?.focus({ preventScroll: true });
        scrollToArticleField(
          editorRef.current?.closest<HTMLElement>('[data-slot="field"]') ??
            editorRef.current,
          "start",
        );
        break;
      case "images":
        editorRef.current?.focus({ preventScroll: true });
        scrollToArticleField(
          imageWarningRef.current ??
            editorRef.current?.closest<HTMLElement>('[data-slot="field"]') ??
            editorRef.current,
          "start",
        );
        break;
      case "cover":
        flushSync(() => {
          setPublishAttempted(true);
        });
        coverSectionRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus({ preventScroll: true });
        scrollToArticleField(coverSectionRef.current);
        break;
      case "accounts":
        scrollToArticleField(accountsSectionRef.current, "start");
        if (entries.length === 0 && !accountsEmpty) {
          setAddOpen(true);
        } else {
          const action =
            accountsSectionRef.current?.querySelector<HTMLElement>(
              'a[href="/platform-accounts"]',
            ) ??
            accountsSectionRef.current?.querySelector<HTMLElement>(
              "button:not(:disabled)",
            );
          action?.focus({ preventScroll: true });
        }
        break;
      case "accountConfig": {
        const accountId = check.accountId;
        if (accountId) {
          // 先渲染目标账号，再按实际表单位置定位（窄屏表单位于名单下方）。
          flushSync(() => {
            setFocusedAccountId(accountId);
          });
        }
        const editor = accountsSectionRef.current?.querySelector<HTMLElement>(
          '[data-slot="article-account-editor"]',
        );
        const invalidField = editor?.querySelector<HTMLElement>(
          '[data-slot="field"][data-invalid="true"]',
        );
        const invalid =
          invalidField?.querySelector<HTMLElement>(
            '[aria-invalid="true"], input:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
          ) ?? editor?.querySelector<HTMLElement>('[aria-invalid="true"]');
        invalid?.focus({ preventScroll: true });
        scrollToArticleField(
          invalidField ??
            invalid?.closest<HTMLElement>('[data-slot="field"]') ??
            editor ??
            accountsSectionRef.current,
          "start",
        );
        break;
      }
    }
  };

  const onSave = async (publish = false) => {
    setValidationAttempted(true);
    if (publish) {
      setPublishAttempted(true);
    }
    const blocked = await composer.save(publish);
    if (blocked) {
      focusCheck(blocked);
    }
  };

  const description = loading
    ? "正在载入…"
    : entries.length === 0
      ? "先写内容，再设封面并选择分发账号"
      : `分发到 ${entries.length} 个账号${pending > 0 ? "" : " · 已就绪"}`;

  const bulkTargets = bulkIds
    ? entries.filter((e) => bulkIds.includes(e.account.id))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <ArticleRecoveryDialog
        open={Boolean(composer.pendingRecovery)}
        busy={composer.resolvingRecovery}
        error={composer.recoveryError}
        onContinue={composer.continueRecovery}
        onNew={() => {
          void composer.startNew();
        }}
      />
      <ArticlePageHeader
        title={composer.isEditing ? "编辑文章" : "发布文章"}
        description={
          composer.isEditing && !loading
            ? "保存不会修改平台上的作品"
            : description
        }
        checks={checks}
        loading={loading}
        disabled={locked}
        saveVariant="outline"
        saveSize="default"
        actions={
          <Button
            type="button"
            size="default"
            disabled={locked}
            onClick={() => {
              void onSave(true);
            }}
          >
            <Send data-icon="inline-start" />
            {composer.publishing ? "提交中…" : "发布文章"}
          </Button>
        }
        saveLabel={
          saving && !composer.publishing
            ? "保存中…"
            : composer.isEditing
              ? "保存修改"
              : "保存草稿"
        }
        onSave={() => {
          void onSave();
        }}
        onFix={focusCheck}
        autoSaveStatus={composer.autoSaveStatus}
        autoSaveFailed={composer.autoSaveFailed}
        onRetryAutoSave={() => {
          void composer.retryAutoSave();
        }}
      />

      {composer.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{composer.error}</AlertTitle>
        </Alert>
      ) : null}

      {loading ? (
        <ComposeSkeleton />
      ) : (
        <div className="flex min-w-0 flex-col gap-8">
          <ArticleDocument
            validationAttempted={validationAttempted}
            title={composer.title}
            onTitleChange={composer.setTitle}
            titleMax={composer.titleMax}
            body={composer.body}
            onBodyChange={composer.setBody}
            bodyMin={composer.bodyLimits.min}
            bodyMax={composer.bodyLimits.max}
            pathWarning={composer.pathWarning}
            disabled={locked}
            titleRef={titleRef}
            editorRef={editorRef}
            imageWarningRef={imageWarningRef}
            maxImages={
              entries.some(({ account }) => account.platform === "douyin")
                ? 30
                : undefined
            }
            previewTargets={
              entries.length
                ? entries.map(({ account }) => ({
                    id: account.id,
                    label: `${composer.platformLabel(account.platform)} · ${account.displayName}`,
                    platform: account.platform,
                    title: getDraft(account.id).title || composer.title,
                  }))
                : [
                    {
                      id: "douyin",
                      label: "抖音",
                      platform: "douyin",
                      title: composer.title,
                    },
                    {
                      id: "toutiao",
                      label: "今日头条",
                      platform: "toutiao",
                      title: composer.title,
                    },
                    {
                      id: "bilibili",
                      label: "哔哩哔哩",
                      platform: "bilibili",
                      title: composer.title,
                    },
                  ]
            }
          />

          <ArticleCoverCard
            sectionRef={coverSectionRef}
            needs={composer.coverNeeds}
            invalidAspects={
              publishAttempted ? composer.missingCommonCoverAspects : []
            }
            covers={covers}
            hasAccounts={entries.length > 0}
            canUseFirstImage={Boolean(composer.firstImagePath)}
            disabled={locked}
            onEdit={(aspect) => {
              composer.openCoverEditor(aspect);
            }}
            onUseFirstImage={composer.applyFirstImageAsCover}
          />

          <section ref={accountsSectionRef} className="flex flex-col gap-4">
            <ArticleDistributionPanel
              entries={entries}
              accountsEmpty={accountsEmpty}
              disabled={locked}
              focusedAccountId={focusedAccountId}
              onFocusAccount={setFocusedAccountId}
              getDraft={getDraft}
              setDraft={composer.setDraft}
              commonTitle={composer.title}
              commonCovers={covers}
              accountIssues={composer.accountIssues}
              onAdd={() => {
                setAddOpen(true);
              }}
              onRemove={composer.removeAccounts}
              onBulkEdit={setBulkIds}
              onEditCover={(accountId, aspect, extraIndex) => {
                composer.openCoverEditor(aspect, { accountId, extraIndex });
              }}
            />
          </section>
        </div>
      )}

      <AddAccountsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        catalog={composer.catalog}
        accounts={composer.accounts}
        selected={composer.selected}
        onConfirm={(next) => {
          composer.setSelected(next);
          const added = Object.entries(next).find(
            ([id, on]) => on && !composer.selected[id],
          );
          if (added) {
            setFocusedAccountId(added[0]);
          }
          requestAnimationFrame(() => {
            accountsSectionRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        }}
      />

      <ArticleBulkEditDialog
        open={bulkIds !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBulkIds(null);
          }
        }}
        targets={bulkTargets}
        onApply={(patch) => {
          if (bulkIds) {
            composer.applyPatch(bulkIds, patch);
            toast.add({
              type: "success",
              title: `已应用到 ${bulkIds.length} 个账号`,
            });
          }
        }}
      />

      {composer.coverEditor.open ? (
        <ArticleCoverEditDialog
          aspect={composer.coverEditor.aspect}
          initialSourceUrl={composer.coverEditor.initialSource}
          onClose={composer.closeCoverEditor}
          onSaved={composer.onCoverSaved}
        />
      ) : null}
    </div>
  );
}

function ComposeSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-4 h-9 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
