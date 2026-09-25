import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Plus, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import type { PlatformAccountItem, PlatformCatalogItem } from '@/lib/api';
import { ContentInfoForm } from './AccountRuleEditor';
import { AddAccountsDialog } from './AddAccountsDialog';
import { CoverEditorSection } from './CoverEditorSection';
import { DistributionAccountEditor } from './DistributionAccountEditor';
import { DistributionAccountList } from './DistributionAccountList';
import { emptyDraft, type CoverKind, type OverrideDraft } from './helpers';
import { Separator } from '@/components/ui/separator';

export interface AccountGroup {
  platform: string;
  displayName: string;
  accounts: PlatformAccountItem[];
}

export type FocusKind = 'video' | 'images' | 'body' | 'cover' | 'title' | 'accounts' | 'accountConfig' | 'agent';

export type PrecheckItem = {
  id: string;
  label: string;
  ok: boolean;
  fix: ReactNode;
  env?: boolean;
  focusKind?: FocusKind;
  /** 账号配置问题时聚焦指定账号 */
  focusAccountId?: string;
};

/**
 * 左侧编辑区：通用信息 Card（含封面）+ 分发账号 Card（固定主从：列表 + 单编辑区）。
 * 选中本地视频后即可挂载；处理封面期间仍可编辑标题与账号。
 */
export function PublishVideoFormPanel({
  catalog,
  accounts,
  grouped,
  selected,
  setSelected,
  expandedAccountId,
  setExpandedAccountId,
  accountFocusNonce,
  drafts,
  setDraftForAccount,
  getDraft,
  loading,
  accountsEmpty,
  accountsSectionRef,
  coverSectionRef,
  title,
  setTitle,
  body,
  setBody,
  coverReady,
  coverLandscapeReady,
  coverPreviewUrl,
  coverLandscapePreviewUrl,
  coverHint,
  onEditCover,
  onEditAccountCover,
  titleInputRef,
  disabled,
  coverDisabled,
  portraitCoverOnly = false,
}: {
  catalog: PlatformCatalogItem[];
  accounts: PlatformAccountItem[];
  grouped: AccountGroup[];
  selected: Record<string, boolean>;
  setSelected: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  expandedAccountId: string | null;
  setExpandedAccountId: (id: string | null) => void;
  /** 父级 checklist 聚焦账号时递增，窄屏自动打开 Sheet */
  accountFocusNonce: number;
  drafts: Record<string, OverrideDraft>;
  setDraftForAccount: (accountId: string, draft: OverrideDraft) => void;
  getDraft: (accountId: string) => OverrideDraft;
  loading: boolean;
  accountsEmpty: boolean;
  accountsSectionRef: RefObject<HTMLDivElement | null>;
  coverSectionRef: RefObject<HTMLDivElement | null>;
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  coverReady: boolean;
  coverLandscapeReady: boolean;
  coverPreviewUrl: string | null;
  coverLandscapePreviewUrl: string | null;
  coverHint: string;
  onEditCover: (kind: CoverKind) => void;
  onEditAccountCover: (accountId: string, kind: CoverKind) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  /** 视频处理/截帧进行中禁用封面操作，避免与自动截帧冲突 */
  coverDisabled?: boolean;
  /** 图文仅竖版封面 */
  portraitCoverOnly?: boolean;
}) {
  const isMobile = useIsMobile();
  const [addOpen, setAddOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const selectedEntries = grouped.flatMap((group) =>
    group.accounts
      .filter((account) => selected[account.id])
      .map((account) => ({ account, platformLabel: group.displayName }))
  );
  const selectedCount = selectedEntries.length;

  const focusedEntry =
    selectedEntries.find((entry) => entry.account.id === expandedAccountId) ??
    selectedEntries.find((entry) => entry.account.status === 'active') ??
    selectedEntries[0] ??
    null;

  // 有已选账号时保证始终有聚焦项（添加/移除后自动修正）
  useEffect(() => {
    if (selectedCount === 0) {
      return;
    }
    const stillSelected = expandedAccountId && selected[expandedAccountId];
    if (!stillSelected) {
      const next = selectedEntries.find((e) => e.account.status === 'active') ?? selectedEntries[0];
      if (next) {
        setExpandedAccountId(next.account.id);
      }
    }
  }, [selectedCount, expandedAccountId, selected, selectedEntries, setExpandedAccountId]);

  useEffect(() => {
    if (accountFocusNonce > 0 && isMobile && expandedAccountId) {
      setSheetOpen(true);
    }
  }, [accountFocusNonce, isMobile, expandedAccountId]);

  const removeAccount = (accountId: string) => {
    const index = selectedEntries.findIndex((e) => e.account.id === accountId);
    setSelected((prev) => ({
      ...prev,
      [accountId]: false,
    }));
    if (expandedAccountId === accountId) {
      setSheetOpen(false);
    }
    if (expandedAccountId !== accountId) {
      return;
    }
    const remaining = selectedEntries.filter((e) => e.account.id !== accountId);
    const next = remaining[index] ?? remaining[index - 1] ?? null;
    setExpandedAccountId(next?.account.id ?? null);
  };

  const focusAccount = (accountId: string) => {
    setExpandedAccountId(accountId);
    if (isMobile) {
      setSheetOpen(true);
    }
  };

  const formDisabled = disabled;
  const coverFormDisabled = coverDisabled ?? formDisabled;

  const accountDescription =
    selectedCount === 0
      ? '添加要推送的抖音账号'
      : `已选 ${selectedCount} 个账号，${isMobile ? '点击账号在面板中配置' : '左侧选择、右侧配置发布选项'}`;

  const editorProps = focusedEntry
    ? {
        account: focusedEntry.account,
        platformLabel: focusedEntry.platformLabel,
        draft: getDraft(focusedEntry.account.id),
        commonTitle: title,
        commonBody: body,
        commonCoverReady: coverReady,
        commonCoverLandscapeReady: coverLandscapeReady,
        commonCoverPreviewUrl: coverPreviewUrl,
        commonCoverLandscapePreviewUrl: coverLandscapePreviewUrl,
        disabled: formDisabled,
        coverDisabled: coverFormDisabled,
        onDraftChange: (draft: OverrideDraft) => {
          setDraftForAccount(focusedEntry.account.id, draft);
        },
        onEditCover: (kind: CoverKind) => {
          onEditAccountCover(focusedEntry.account.id, kind);
        },
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>通用信息</CardTitle>
          <CardDescription>标题、描述与封面作为各账号默认值；发布选项请在下方账号中分别配置</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ContentInfoForm
            title={title}
            setTitle={setTitle}
            body={body}
            setBody={setBody}
            titleInputRef={titleInputRef}
            disabled={formDisabled}
          />
          <Separator />
          <CoverEditorSection
            coverSectionRef={coverSectionRef}
            coverReady={coverReady}
            coverLandscapeReady={coverLandscapeReady}
            coverPreviewUrl={coverPreviewUrl}
            coverLandscapePreviewUrl={coverLandscapePreviewUrl}
            coverHint={coverHint}
            disabled={coverFormDisabled}
            onEditCover={onEditCover}
            portraitOnly={portraitCoverOnly}
          />
        </CardContent>
      </Card>

      <Card ref={accountsSectionRef} className="flex flex-col">
        <CardHeader className="shrink-0 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>分发账号</CardTitle>
              <CardDescription>{accountDescription}</CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || formDisabled}
              aria-label="添加分发账号"
              onClick={() => {
                setAddOpen(true);
              }}
            >
              <Plus data-icon="inline-start" />
              添加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {accountsEmpty ? (
            <p className="text-muted-foreground">
              还没有绑定媒体账号，请先前往
              <Link to="/platform-accounts" className="mx-1 underline">
                媒体账号
              </Link>
              完成绑定。
            </p>
          ) : selectedCount === 0 ? (
            <p className="text-muted-foreground">
              尚未添加分发账号，点击
              <button
                type="button"
                className="mx-1 underline"
                disabled={formDisabled}
                onClick={() => {
                  setAddOpen(true);
                }}
              >
                添加
              </button>
              选择要推送的账号。
            </p>
          ) : (
            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
              <DistributionAccountList
                entries={selectedEntries}
                drafts={drafts}
                focusedAccountId={focusedEntry?.account.id ?? null}
                disabled={loading || formDisabled}
                plain
                onFocusAccount={focusAccount}
                onRemoveAccount={removeAccount}
              />
              <div className="hidden lg:block">
                <DistributionAccountEditor
                  account={editorProps?.account ?? null}
                  platformLabel={editorProps?.platformLabel ?? '抖音'}
                  draft={editorProps?.draft ?? emptyDraft()}
                  commonTitle={editorProps?.commonTitle ?? title}
                  commonBody={editorProps?.commonBody ?? body}
                  commonCoverReady={editorProps?.commonCoverReady ?? coverReady}
                  commonCoverLandscapeReady={
                    editorProps?.commonCoverLandscapeReady ?? coverLandscapeReady
                  }
                  commonCoverPreviewUrl={editorProps?.commonCoverPreviewUrl ?? coverPreviewUrl}
                  commonCoverLandscapePreviewUrl={
                    editorProps?.commonCoverLandscapePreviewUrl ?? coverLandscapePreviewUrl
                  }
                  coverDisabled={editorProps?.coverDisabled ?? coverFormDisabled}
                  disabled={editorProps?.disabled ?? formDisabled}
                  className="min-h-[280px]"
                  plain
                  portraitOnly={portraitCoverOnly}
                  onDraftChange={
                    editorProps?.onDraftChange ??
                    (() => {
                      /* 无选中账号时不写入 */
                    })
                  }
                  onEditCover={
                    editorProps?.onEditCover ??
                    (() => {
                      /* 无选中账号 */
                    })
                  }
                />
              </div>
            </div>
          )}

          <AddAccountsDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            catalog={catalog}
            accounts={accounts}
            selected={selected}
            onConfirm={(next) => {
              setSelected(() => next);
              if (expandedAccountId && !next[expandedAccountId]) {
                setExpandedAccountId(null);
                setSheetOpen(false);
              }
              const added = Object.entries(next).find(([id, checked]) => {
                return checked && !selected[id];
              });
              if (added) {
                focusAccount(added[0]);
              }
            }}
          />
        </CardContent>
      </Card>

      {isMobile && editorProps ? (
        <Sheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open);
          }}
        >
          <SheetContent side="bottom" className="flex max-h-[min(85dvh,720px)] flex-col gap-0 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{editorProps.account.displayName}</SheetTitle>
              <SheetDescription>配置该账号的发布选项</SheetDescription>
            </SheetHeader>
            <DistributionAccountEditor
              account={editorProps.account}
              platformLabel={editorProps.platformLabel}
              draft={editorProps.draft}
              commonTitle={editorProps.commonTitle}
              commonBody={editorProps.commonBody}
              commonCoverReady={editorProps.commonCoverReady}
              commonCoverLandscapeReady={editorProps.commonCoverLandscapeReady}
              commonCoverPreviewUrl={editorProps.commonCoverPreviewUrl}
              commonCoverLandscapePreviewUrl={editorProps.commonCoverLandscapePreviewUrl}
              coverDisabled={editorProps.coverDisabled}
              disabled={editorProps.disabled}
              className="min-h-0 flex-1"
              plain
              portraitOnly={portraitCoverOnly}
              onDraftChange={editorProps.onDraftChange}
              onEditCover={editorProps.onEditCover}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

/** 底栏就绪清单：复用 submit 前校验项，让用户知道还差什么；随页面正常滚动。 */
export function PublishVideoActionBar({
  prechecks,
  readyCount,
  totalCount,
  busy,
  busyLabel,
  publishBlocked,
  publishHint,
  onFocusItem,
  onSaveDraft,
  onPublish,
  className,
}: {
  prechecks: PrecheckItem[];
  readyCount: number;
  totalCount: number;
  busy: boolean;
  busyLabel: string;
  publishBlocked: boolean;
  publishHint: string;
  onFocusItem: (item: PrecheckItem) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'shrink-0 bg-background py-3',
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-medium">
          就绪 {readyCount}/{totalCount}
          {publishHint ? <span className="ml-2 font-normal text-muted-foreground">{publishHint}</span> : null}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {prechecks.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'inline-flex items-center gap-1 text-xs transition-colors',
                item.ok ? 'text-muted-foreground' : 'text-foreground hover:underline',
                !item.focusKind || item.ok ? 'cursor-default' : 'cursor-pointer'
              )}
              disabled={item.ok || !item.focusKind}
              onClick={() => {
                if (!item.ok && item.focusKind) {
                  onFocusItem(item);
                }
              }}
            >
              {item.ok ? (
                <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
              ) : (
                <Circle className="size-3.5 text-muted-foreground" aria-hidden />
              )}
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onSaveDraft}>
          <Save data-icon="inline-start" />
          存草稿
        </Button>
        <Button disabled={busy || publishBlocked} onClick={onPublish}>
          <Send data-icon="inline-start" />
          {busy ? busyLabel : '发布'}
        </Button>
      </div>
    </div>
  );
}
