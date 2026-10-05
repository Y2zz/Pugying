import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { toast } from "@/components/AppToaster";
import { ArticleCoverEditDialog } from "./publish-article/ArticleCoverEditDialog";
import { PublishingPageHeader } from "@/components/publishing/PublishingPageHeader";
import { scrollToArticleField } from "./publish-article/scroll-to-article-field";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AddAccountsDialog } from "./publish-video/AddAccountsDialog";
import { GraphicBulkEditDialog } from "./publish-graphic/GraphicBulkEditDialog";
import { GraphicChecklistBar } from "./publish-graphic/GraphicChecklistCard";
import { GraphicCoverCard } from "./publish-graphic/GraphicCoverCard";
import { DistributionAccountsPanel } from "@/components/publishing/DistributionAccountsPanel";
import { GraphicAccountEditor } from "./publish-graphic/GraphicAccountEditor";
import { GraphicAccountStatus } from "./publish-graphic/GraphicAccountStatus";
import { GraphicDocument } from "./publish-graphic/GraphicDocument";
import {
  useGraphicComposer,
  type GraphicCheck,
} from "./publish-graphic/use-graphic-composer";

/**
 * 图文发布页：多图轮播 + 文案分离，再设封面与分发账号。
 */
export default function PublishGraphic() {
  const [params] = useSearchParams();
  const composer = useGraphicComposer(params.get("id"));
  const { loading, saving, entries, checks, covers, getDraft } = composer;

  const [validationAttempted, setValidationAttempted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [focusedAccountId, setFocusedAccountId] = useState<string | null>(null);
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);
  const coverSectionRef = useRef<HTMLElement>(null);
  const accountsSectionRef = useRef<HTMLDivElement>(null);

  const locked = loading || saving;
  const accountsEmpty = !loading && composer.accounts.length === 0;
  const pending = checks.filter((c) => !c.ok).length;

  const scrollTo = (
    el: HTMLElement | null,
    block: ScrollLogicalPosition = "center",
  ) => {
    scrollToArticleField(el, block);
  };

  const focusCheck = (check: GraphicCheck) => {
    switch (check.id) {
      case "title":
        titleRef.current?.focus({ preventScroll: true });
        scrollTo(titleRef.current);
        break;
      case "body":
        bodyRef.current?.focus({ preventScroll: true });
        scrollTo(bodyRef.current);
        break;
      case "images":
        scrollTo(imagesRef.current, "start");
        break;
      case "cover":
        scrollTo(coverSectionRef.current);
        break;
      case "accounts":
        scrollTo(accountsSectionRef.current);
        if (entries.length === 0 && !accountsEmpty) {
          setAddOpen(true);
        }
        break;
      case "accountConfig":
        {
          if (check.accountId) {
            flushSync(() => {
              setFocusedAccountId(check.accountId!);
            });
          }
          const editor = accountsSectionRef.current?.querySelector<HTMLElement>(
            '[data-slot="graphic-account-editor"]',
          );
          const field = editor?.querySelector<HTMLElement>(
            '[data-slot="field"][data-invalid="true"]',
          );
          const input = field?.querySelector<HTMLElement>(
            '[aria-invalid="true"], input:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
          );
          input?.focus({ preventScroll: true });
          scrollTo(field ?? editor ?? accountsSectionRef.current, "start");
        }
        break;
    }
  };

  const onSave = async () => {
    setValidationAttempted(true);
    const blocked = await composer.save();
    if (blocked) {
      focusCheck(blocked);
    }
  };

  const description = loading
    ? "正在载入…"
    : entries.length === 0
      ? "先选图片、写文案，再设封面并选择分发账号"
      : `分发到 ${entries.length} 个账号${pending > 0 ? "" : " · 已就绪"}`;

  const bulkTargets = bulkIds
    ? entries.filter((e) => bulkIds.includes(e.account.id))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PublishingPageHeader
        title={composer.isEditing ? "编辑图文" : "发布图文"}
        description={description}
        checks={checks}
        loading={loading}
        disabled={locked}
        saveLabel={
          saving ? "保存中…" : composer.isEditing ? "保存修改" : "保存草稿"
        }
        onSave={() => {
          void onSave();
        }}
        onFix={focusCheck}
        renderChecks={(onFix) => (
          <GraphicChecklistBar checks={checks} onFix={onFix} />
        )}
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
          <GraphicDocument
            validationAttempted={validationAttempted}
            title={composer.title}
            onTitleChange={composer.setTitle}
            titleMax={composer.titleMax}
            limitsActive={entries.length > 0}
            body={composer.body}
            onBodyChange={composer.setBody}
            bodyMin={composer.bodyLimits.min}
            bodyMax={composer.bodyLimits.max}
            mediaPaths={composer.mediaPaths}
            onMediaPathsChange={composer.setMediaPaths}
            pathWarning={composer.pathWarning}
            disabled={locked}
            titleRef={titleRef}
            bodyRef={bodyRef}
            imagesRef={imagesRef}
          />

          <GraphicCoverCard
            sectionRef={coverSectionRef}
            needs={composer.coverNeeds}
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
            <DistributionAccountsPanel
              entries={entries}
              accountsEmpty={accountsEmpty}
              disabled={locked}
              focusedAccountId={focusedAccountId}
              onFocusAccount={setFocusedAccountId}
              onAdd={() => {
                setAddOpen(true);
              }}
              onRemove={composer.removeAccounts}
              onBulkEdit={setBulkIds}
              renderStatus={({ account }) => (
                <GraphicAccountStatus
                  account={account}
                  draft={getDraft(account.id)}
                  commonCovers={covers}
                  issues={composer.accountIssues.get(account.id) ?? []}
                />
              )}
            >
              <GraphicAccountEditor
                entries={entries}
                accountId={focusedAccountId}
                onNavigate={setFocusedAccountId}
                getDraft={getDraft}
                setDraft={composer.setDraft}
                commonTitle={composer.title}
                commonBody={composer.body}
                commonCovers={covers}
                disabled={locked}
                onEditCover={(accountId, aspect) => {
                  composer.openCoverEditor(aspect, { accountId });
                }}
                className="min-h-[28rem] lg:min-h-[32rem]"
              />
            </DistributionAccountsPanel>
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

      <GraphicBulkEditDialog
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
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
