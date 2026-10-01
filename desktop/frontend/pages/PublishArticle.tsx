import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Save } from 'lucide-react';
import { toast } from '@/components/AppToaster';
import { EditCoverDialog } from '@/components/EditCoverDialog';
import {
  PageHeader,
  PageHeaderAction,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@/components/layouts/PageHeader';
import { StickyPageHeader } from '@/components/layouts/StickyPageHeader';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AddAccountsDialog } from './publish-video/AddAccountsDialog';
import { ArticleBulkEditDialog } from './publish-article/ArticleBulkEditDialog';
import { ArticleChecklistBar } from './publish-article/ArticleChecklistCard';
import { ArticleCoverCard } from './publish-article/ArticleCoverCard';
import { ArticleDistributionPanel } from './publish-article/ArticleDistributionPanel';
import { ArticleDocument } from './publish-article/ArticleDocument';
import { useArticleComposer, type ArticleCheck } from './publish-article/use-article-composer';

/**
 * 文章发布页单列主流程（顺序有意如此）：
 * 1. 内容（标题/富文本正文）——创作主路径
 * 2. 通用封面——先定默认，再允许账号覆盖；槽位随已选平台动态收紧
 * 3. 分发账号——名单 + 同屏表单
 * 发布检查挂在页头贴近「保存」，不当作中间步骤。
 */
export default function PublishArticle() {
  const [params] = useSearchParams();
  const composer = useArticleComposer(params.get('id'));
  const {
    loading,
    saving,
    entries,
    checks,
    covers,
    getDraft,
  } = composer;

  const [addOpen, setAddOpen] = useState(false);
  const [focusedAccountId, setFocusedAccountId] = useState<string | null>(null);
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const coverSectionRef = useRef<HTMLElement>(null);
  const accountsSectionRef = useRef<HTMLDivElement>(null);

  const locked = loading || saving;
  const accountsEmpty = !loading && composer.accounts.length === 0;
  const pending = checks.filter((c) => !c.ok).length;

  const scrollTo = (el: HTMLElement | null, block: ScrollLogicalPosition = 'center') => {
    el?.scrollIntoView({ behavior: 'smooth', block });
  };

  const focusCheck = (check: ArticleCheck) => {
    switch (check.id) {
      case 'title':
        titleRef.current?.focus();
        scrollTo(titleRef.current);
        break;
      case 'body':
      case 'images':
        editorRef.current?.focus();
        scrollTo(editorRef.current, 'start');
        break;
      case 'cover':
        scrollTo(coverSectionRef.current);
        break;
      case 'accounts':
        scrollTo(accountsSectionRef.current);
        if (entries.length === 0 && !accountsEmpty) {
          setAddOpen(true);
        }
        break;
      case 'accountConfig':
        scrollTo(accountsSectionRef.current, 'start');
        if (check.accountId) {
          setFocusedAccountId(check.accountId);
        }
        break;
    }
  };

  const onSave = async () => {
    const blocked = await composer.save();
    if (blocked) {
      focusCheck(blocked);
    }
  };

  const description = loading
    ? '正在载入…'
    : entries.length === 0
      ? '先写内容，再设封面并选择分发账号'
      : `分发到 ${entries.length} 个账号${pending > 0 ? '' : ' · 已就绪'}`;

  const bulkTargets = bulkIds ? entries.filter((e) => bulkIds.includes(e.account.id)) : [];

  return (
    <div className="flex flex-col gap-6">
      <StickyPageHeader showDivider className="gap-4">
        <PageHeader>
          <PageHeaderTitle>{composer.isEditing ? '编辑文章' : '发布文章'}</PageHeaderTitle>
          <PageHeaderDescription>{description}</PageHeaderDescription>
          <PageHeaderAction>
            <Button
              type="button"
              disabled={locked}
              onClick={() => {
                void onSave();
              }}
            >
              <Save data-icon="inline-start" />
              {saving ? '保存中…' : composer.isEditing ? '保存修改' : '保存草稿'}
            </Button>
          </PageHeaderAction>
        </PageHeader>
        {!loading ? <ArticleChecklistBar checks={checks} onFix={focusCheck} /> : null}
      </StickyPageHeader>

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
            title={composer.title}
            onTitleChange={composer.setTitle}
            titleMax={composer.titleMax}
            limitsActive={entries.length > 0}
            body={composer.body}
            onBodyChange={composer.setBody}
            bodyMin={composer.bodyLimits.min}
            bodyMax={composer.bodyLimits.max}
            pathWarning={composer.pathWarning}
            disabled={locked}
            titleRef={titleRef}
            editorRef={editorRef}
          />

          <Separator />

          <ArticleCoverCard
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

          <Separator />

          <section ref={accountsSectionRef} className="flex flex-col gap-4">
            <div>
              <h2 className="font-heading text-lg font-medium tracking-tight">分发账号</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                正文共用；点左侧账号，在右侧覆盖标题、封面与发布选项
              </p>
            </div>
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
              onEditCover={(accountId, aspect) => {
                composer.openCoverEditor(aspect, { accountId });
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
          const added = Object.entries(next).find(([id, on]) => on && !composer.selected[id]);
          if (added) {
            setFocusedAccountId(added[0]);
          }
          requestAnimationFrame(() => {
            accountsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            toast.add({ type: 'success', title: `已应用到 ${bulkIds.length} 个账号` });
          }
        }}
      />

      <EditCoverDialog
        open={composer.coverEditor.open}
        aspect={composer.coverEditor.aspect}
        videoUrl={null}
        initialSourceUrl={composer.coverEditor.initialSource}
        initialFrameTime={null}
        onOpenChange={(open) => {
          if (!open) {
            composer.closeCoverEditor();
          }
        }}
        onSaved={composer.onCoverSaved}
      />
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
