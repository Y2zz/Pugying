import { useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings2, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlatformIcon } from '@/components/PlatformIcon';
import { cn } from '@/lib/utils';
import type { ContentVisibility, PlatformAccountItem, PlatformCatalogItem } from '@/lib/api';
import { AccountOverrideForm, CommonRuleForm } from './AccountRuleEditor';
import { AddAccountsDialog } from './AddAccountsDialog';
import {
  ACCOUNT_STATUS_TEXT,
  RULE_FOCUS_COMMON,
  draftToOverrides,
  emptyDraft,
  overrideCount,
  type CoverKind,
  type OverrideDraft,
  type RuleFocus,
} from './helpers';

export interface AccountGroup {
  platform: string;
  displayName: string;
  accounts: PlatformAccountItem[];
}

export function PublishRulesStep({
  catalog,
  accounts,
  grouped,
  selected,
  setSelected,
  ruleFocus,
  setRuleFocus,
  drafts,
  setDraftForAccount,
  getDraft,
  loading,
  accountsEmpty,
  accountsSectionRef,
  // common form
  title,
  setTitle,
  body,
  setBody,
  location,
  setLocation,
  tags,
  setTags,
  visibility,
  setVisibility,
  scheduleEnabled,
  setScheduleEnabled,
  scheduledLocal,
  setScheduledLocal,
  allowDownload,
  setAllowDownload,
  coverUrl,
  coverLandscapeUrl,
  coverPreviewUrl,
  coverLandscapePreviewUrl,
  coverHint,
  coverSectionRef,
  titleInputRef,
  scheduleInputRef,
  disabled,
  onCropCover,
  onReplaceCover,
  onAccountUpdated,
}: {
  catalog: PlatformCatalogItem[];
  accounts: PlatformAccountItem[];
  grouped: AccountGroup[];
  selected: Record<string, boolean>;
  setSelected: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  ruleFocus: RuleFocus;
  setRuleFocus: (focus: RuleFocus) => void;
  drafts: Record<string, OverrideDraft>;
  setDraftForAccount: (accountId: string, draft: OverrideDraft) => void;
  getDraft: (accountId: string) => OverrideDraft;
  loading: boolean;
  accountsEmpty: boolean;
  accountsSectionRef: RefObject<HTMLDivElement | null>;
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  tags: string[];
  setTags: (v: string[]) => void;
  visibility: ContentVisibility;
  setVisibility: (v: ContentVisibility) => void;
  scheduleEnabled: boolean;
  setScheduleEnabled: (v: boolean) => void;
  scheduledLocal: string;
  setScheduledLocal: (v: string) => void;
  allowDownload: boolean;
  setAllowDownload: (v: boolean) => void;
  coverUrl: string;
  coverLandscapeUrl: string;
  coverPreviewUrl: string | null;
  coverLandscapePreviewUrl: string | null;
  coverHint: string;
  coverSectionRef: RefObject<HTMLDivElement | null>;
  titleInputRef: RefObject<HTMLInputElement | null>;
  scheduleInputRef: RefObject<HTMLButtonElement | null>;
  disabled: boolean;
  onCropCover: (kind: CoverKind) => void;
  onReplaceCover: (file: File, kind: CoverKind) => void;
  onAccountUpdated: (account: PlatformAccountItem) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const focusedAccount =
    ruleFocus === RULE_FOCUS_COMMON
      ? null
      : grouped.flatMap((g) => g.accounts.map((account) => ({ account, platformLabel: g.displayName }))).find((item) => item.account.id === ruleFocus) ??
        null;

  const selectedEntries = grouped.flatMap((group) =>
    group.accounts
      .filter((account) => selected[account.id])
      .map((account) => ({ account, platformLabel: group.displayName }))
  );
  const selectedCount = selectedEntries.length;

  const removeAccount = (accountId: string) => {
    setSelected((prev) => ({
      ...prev,
      [accountId]: false,
    }));
    if (ruleFocus === accountId) {
      setRuleFocus(RULE_FOCUS_COMMON);
    }
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div ref={accountsSectionRef} className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle>分发账号</CardTitle>
                <CardDescription>
                  {selectedCount > 0 ? `已选 ${selectedCount} 个账号` : '添加要推送的账号，点名称编辑差异规则'}
                </CardDescription>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={loading || disabled}
                aria-label="添加分发账号"
                onClick={() => {
                  setAddOpen(true);
                }}
              >
                <Plus />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                ruleFocus === RULE_FOCUS_COMMON ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'
              )}
              onClick={() => {
                setRuleFocus(RULE_FOCUS_COMMON);
              }}
            >
              <Settings2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">通用设置</span>
            </button>

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
                尚未添加分发账号，点击右上角
                <button
                  type="button"
                  className="mx-1 underline"
                  onClick={() => {
                    setAddOpen(true);
                  }}
                >
                  添加
                </button>
                。
              </p>
            ) : null}

            {selectedEntries.map(({ account, platformLabel }) => {
              const usable = account.status === 'active';
              const isFocused = ruleFocus === account.id;
              const ovCount = overrideCount(draftToOverrides(drafts[account.id] ?? emptyDraft()));
              return (
                <div
                  key={account.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-md border px-2 py-2',
                    isFocused ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
                    !usable || loading ? 'opacity-60' : null
                  )}
                >
                  <button
                    type="button"
                    disabled={!usable || loading}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
                    onClick={() => {
                      if (usable) {
                        setRuleFocus(account.id);
                      }
                    }}
                  >
                    <Avatar size="sm">
                      {account.avatarUrl ? (
                        <AvatarImage src={account.avatarUrl} alt={account.displayName} referrerPolicy="no-referrer" />
                      ) : null}
                      <AvatarFallback>{account.displayName.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={account.displayName}>
                        {account.displayName}
                      </p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <PlatformIcon platform={account.platform} className="size-3.5" />
                        <span className="truncate">{platformLabel}</span>
                      </p>
                    </div>
                  </button>
                  {!usable ? (
                    <Badge variant="outline" className="shrink-0">
                      {ACCOUNT_STATUS_TEXT[account.status]}
                    </Badge>
                  ) : ovCount > 0 ? (
                    <Badge variant="secondary" className="shrink-0">
                      差异
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0 opacity-60 hover:opacity-100"
                    aria-label={`移除 ${account.displayName}`}
                    disabled={loading || disabled}
                    onClick={() => {
                      removeAccount(account.id);
                    }}
                  >
                    <X />
                  </Button>
                </div>
              );
            })}

            {!accountsEmpty ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loading || disabled}
                onClick={() => {
                  setAddOpen(true);
                }}
              >
                <Plus data-icon="inline-start" />
                添加分发账号
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{focusedAccount ? '账号发布规则' : '通用发布规则'}</CardTitle>
          <CardDescription>
            {focusedAccount
              ? '仅填写需要覆盖的字段；留空则继承左侧「通用设置」'
              : '标题、封面与发布选项将作为各账号的默认值'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {focusedAccount ? (
            <AccountOverrideForm
              account={focusedAccount.account}
              platformLabel={focusedAccount.platformLabel}
              draft={getDraft(focusedAccount.account.id)}
              disabled={disabled}
              onDraftChange={(draft) => {
                setDraftForAccount(focusedAccount.account.id, draft);
              }}
              onBackToCommon={() => {
                setRuleFocus(RULE_FOCUS_COMMON);
              }}
            />
          ) : (
            <CommonRuleForm
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
              disabled={disabled}
              onCropCover={onCropCover}
              onReplaceCover={onReplaceCover}
            />
          )}
        </CardContent>
      </Card>

      <AddAccountsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        catalog={catalog}
        accounts={accounts}
        selected={selected}
        onAccountUpdated={onAccountUpdated}
        onConfirm={(next) => {
          setSelected(() => next);
          // 若当前聚焦账号已被取消勾选，回到通用设置
          if (ruleFocus !== RULE_FOCUS_COMMON && !next[ruleFocus]) {
            setRuleFocus(RULE_FOCUS_COMMON);
          }
        }}
      />
    </div>
  );
}
