import { useState, type ReactNode, type RefObject } from "react";
import { CheckCircle2 } from "lucide-react";
import { DistributionAccountsPanel } from "@/components/publishing/DistributionAccountsPanel";
import { Badge } from "@/components/ui/badge";
import type { PlatformAccountItem, PlatformCatalogItem } from "@/lib/api";
import { ContentInfoForm } from "./AccountRuleEditor";
import { AddAccountsDialog } from "./AddAccountsDialog";
import { ArticleCoverCard } from "../publish-article/ArticleCoverCard";
import { DistributionAccountEditor } from "./DistributionAccountEditor";
import {
  ACCOUNT_STATUS_TEXT,
  getAccountDraftIssues,
  type CoverKind,
  type OverrideDraft,
} from "./helpers";

export interface AccountGroup {
  platform: string;
  displayName: string;
  accounts: PlatformAccountItem[];
}

export type FocusKind =
  | "video"
  | "images"
  | "body"
  | "cover"
  | "title"
  | "accounts"
  | "accountConfig"
  | "agent";

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
 * 通用信息与分发账号纵向排列，共用页面完整宽度。
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
  validationAttempted = false,
  disabled,
  coverDisabled,
  portraitCoverOnly = false,
}: {
  catalog: PlatformCatalogItem[];
  accounts: PlatformAccountItem[];
  grouped: AccountGroup[];
  selected: Record<string, boolean>;
  setSelected: (
    updater: (prev: Record<string, boolean>) => Record<string, boolean>,
  ) => void;
  expandedAccountId: string | null;
  setExpandedAccountId: (id: string | null) => void;
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
  validationAttempted?: boolean;
  /** 视频处理/截帧进行中禁用封面操作，避免与自动截帧冲突 */
  coverDisabled?: boolean;
  /** 图文仅竖版封面 */
  portraitCoverOnly?: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const selectedEntries = grouped.flatMap((group) =>
    group.accounts
      .filter((account) => selected[account.id])
      .map((account) => ({ account, platformLabel: group.displayName })),
  );

  const focusedEntry =
    selectedEntries.find((entry) => entry.account.id === expandedAccountId) ??
    selectedEntries.find((entry) => entry.account.status === "active") ??
    selectedEntries[0] ??
    null;

  const removeAccounts = (accountIds: string[]) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const id of accountIds) {
        next[id] = false;
      }
      return next;
    });
  };

  const focusAccount = (accountId: string) => {
    setExpandedAccountId(accountId);
  };

  const formDisabled = disabled;
  const coverFormDisabled = coverDisabled ?? formDisabled;

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
    <div className="contents">
      <section className="order-2 min-w-0">
        <ContentInfoForm
          title={title}
          setTitle={setTitle}
          body={body}
          setBody={setBody}
          titleInputRef={titleInputRef}
          validationAttempted={validationAttempted}
          disabled={formDisabled}
        />
      </section>
      <div ref={coverSectionRef} className="order-2 min-w-0">
        <ArticleCoverCard
          needs={
            portraitCoverOnly
              ? [{ aspect: "portrait", required: false, platformLabels: [] }]
              : [
                  {
                    aspect: "portrait",
                    required: false,
                    platformLabels: ["抖音"],
                  },
                  {
                    aspect: "landscape",
                    required: false,
                    platformLabels: ["抖音"],
                  },
                ]
          }
          covers={{
            portrait: {
              blob: null,
              saved: coverReady,
              previewUrl: coverPreviewUrl ?? "",
              sourceUrl: "",
            },
            landscape: {
              blob: null,
              saved: coverLandscapeReady,
              previewUrl: coverLandscapePreviewUrl ?? "",
              sourceUrl: "",
            },
          }}
          hasAccounts={selectedEntries.length > 0}
          canUseFirstImage={false}
          disabled={coverFormDisabled}
          onEdit={(aspect) =>
            onEditCover(aspect === "portrait" ? "cover" : "cover_landscape")
          }
          onUseFirstImage={() => {}}
        />
        {coverHint ? (
          <p className="mt-2 text-xs text-muted-foreground">{coverHint}</p>
        ) : null}
      </div>

      <section
        ref={accountsSectionRef}
        className="order-3 flex min-w-0 flex-col gap-4"
      >
        <DistributionAccountsPanel
          entries={selectedEntries}
          accountsEmpty={accountsEmpty}
          disabled={loading || formDisabled}
          focusedAccountId={expandedAccountId}
          onFocusAccount={focusAccount}
          onAdd={() => {
            setAddOpen(true);
          }}
          onRemove={removeAccounts}
          renderStatus={({ account }) => {
            if (account.status !== "active") {
              return (
                <Badge variant="outline">
                  {ACCOUNT_STATUS_TEXT[account.status]}
                </Badge>
              );
            }
            const issues = getAccountDraftIssues(
              getDraft(account.id),
              body,
              account.platform,
              title,
            );
            return issues.length > 0 ? (
              <Badge variant="destructive">{issues[0]}</Badge>
            ) : (
              <Badge variant="secondary">
                <CheckCircle2 data-icon="inline-start" />
                就绪
              </Badge>
            );
          }}
        >
          {editorProps ? (
            <DistributionAccountEditor
              {...editorProps}
              entries={selectedEntries}
              onNavigate={focusAccount}
              className="min-h-[28rem] lg:min-h-[32rem]"
              portraitOnly={portraitCoverOnly}
            />
          ) : null}
        </DistributionAccountsPanel>

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
            }
            const added = Object.entries(next).find(([id, checked]) => {
              return checked && !selected[id];
            });
            if (added) {
              focusAccount(added[0]);
            }
          }}
        />
      </section>
    </div>
  );
}
