import { useEffect, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { PlatformAccountItem, PlatformCatalogItem } from '@/lib/api';
import { AddAccountsDialog } from '../publish-video/AddAccountsDialog';
import { CharCountInput } from '../publish-video/CharCountFields';
import { CoverEditorSection } from '../publish-video/CoverEditorSection';
import { DistributionAccountEditor } from '../publish-video/DistributionAccountEditor';
import { DistributionAccountList } from '../publish-video/DistributionAccountList';
import { TITLE_MAX, emptyDraft, type CoverKind, type OverrideDraft } from './helpers';
import { ArticleRichTextEditor } from './ArticleRichTextEditor';

export interface AccountGroup {
  platform: string;
  displayName: string;
  accounts: PlatformAccountItem[];
}

/**
 * 图文编辑区：进入即展示；基础信息 Card + 分发账号 Card（主从：列表 + 单编辑区）。
 * 基础字段 = 标题 + 富文本正文 + 竖封面。
 */
export function PublishArticleFormPanel({
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
  onImagesInserted,
  coverReady,
  coverPreviewUrl,
  coverHint,
  onEditCover,
  onEditAccountCover,
  titleInputRef,
  disabled,
}: {
  catalog: PlatformCatalogItem[];
  accounts: PlatformAccountItem[];
  grouped: AccountGroup[];
  selected: Record<string, boolean>;
  setSelected: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  expandedAccountId: string | null;
  setExpandedAccountId: (id: string | null) => void;
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
  onImagesInserted: (paths: string[]) => void;
  coverReady: boolean;
  coverPreviewUrl: string | null;
  coverHint: string;
  onEditCover: (kind: CoverKind) => void;
  onEditAccountCover: (accountId: string, kind: CoverKind) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
}) {
  const isMobile = useIsMobile();
  const [addOpen, setAddOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const selectedEntries = grouped.flatMap((group) =>
    group.accounts
      .filter((account) => selected[account.id])
      .map((account) => ({ account, platformLabel: group.displayName })),
  );
  const selectedCount = selectedEntries.length;

  const focusedEntry =
    selectedEntries.find((entry) => entry.account.id === expandedAccountId) ??
    selectedEntries.find((entry) => entry.account.status === 'active') ??
    selectedEntries[0] ??
    null;

  useEffect(() => {
    if (selectedCount === 0) {
      return;
    }
    const stillSelected = expandedAccountId && selected[expandedAccountId];
    if (!stillSelected) {
      const next =
        selectedEntries.find((e) => e.account.status === 'active') ?? selectedEntries[0];
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
        commonCoverPreviewUrl: coverPreviewUrl,
        disabled,
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
          <CardTitle>基础信息</CardTitle>
          <CardDescription>
            标题、正文与封面；正文支持富文本，可插入本机图片（发布时作为配图推送）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="article-title">标题</FieldLabel>
              <CharCountInput
                id="article-title"
                ref={titleInputRef}
                placeholder="填写图文标题"
                max={TITLE_MAX}
                disabled={disabled}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel>正文</FieldLabel>
              <FieldDescription>纯文字计字：最少 200、最多 5 万；可插入本机图片作为配图</FieldDescription>
              <ArticleRichTextEditor
                value={body}
                disabled={disabled}
                onChange={setBody}
                onImagesInserted={onImagesInserted}
              />
            </Field>
            <CoverEditorSection
              coverSectionRef={coverSectionRef}
              coverReady={coverReady}
              coverLandscapeReady={true}
              coverPreviewUrl={coverPreviewUrl}
              coverLandscapePreviewUrl={null}
              coverHint={coverHint}
              disabled={disabled}
              onEditCover={onEditCover}
              portraitOnly
            />
          </FieldGroup>
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
              disabled={loading || disabled}
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
                disabled={disabled}
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
                disabled={loading || disabled}
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
                  commonCoverLandscapeReady={true}
                  commonCoverPreviewUrl={editorProps?.commonCoverPreviewUrl ?? coverPreviewUrl}
                  commonCoverLandscapePreviewUrl={null}
                  coverDisabled={editorProps?.disabled ?? disabled}
                  disabled={editorProps?.disabled ?? disabled}
                  className="min-h-[280px]"
                  plain
                  portraitOnly
                  onDraftChange={
                    editorProps?.onDraftChange ??
                    (() => {
                      /* 无选中账号 */
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
              commonCoverLandscapeReady={true}
              commonCoverPreviewUrl={editorProps.commonCoverPreviewUrl}
              commonCoverLandscapePreviewUrl={null}
              coverDisabled={editorProps.disabled}
              disabled={editorProps.disabled}
              className="min-h-0 flex-1"
              plain
              portraitOnly
              onDraftChange={editorProps.onDraftChange}
              onEditCover={editorProps.onEditCover}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
