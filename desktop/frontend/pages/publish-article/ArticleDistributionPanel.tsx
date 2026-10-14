import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DistributionAccountsPanel } from "@/components/publishing/DistributionAccountsPanel";
import type { CoverKind, PlatformAccountItem } from "@/lib/api";
import { ArticleAccountEditor } from "./ArticleAccountEditor";
import {
  ACCOUNT_STATUS_TEXT,
  type ArticleOverrideDraft,
  type CoverPair,
  missingRequiredCovers,
} from "../publish-article/helpers";
import type { ArticleRosterEntry } from "./use-article-composer";

export function ArticleDistributionPanel({
  entries,
  accountsEmpty,
  disabled,
  focusedAccountId,
  onFocusAccount,
  getDraft,
  setDraft,
  commonTitle,
  commonCovers,
  accountIssues,
  onAdd,
  onRemove,
  onBulkEdit,
  onEditCover,
}: {
  entries: ArticleRosterEntry[];
  accountsEmpty: boolean;
  disabled?: boolean;
  focusedAccountId: string | null;
  onFocusAccount: (accountId: string) => void;
  getDraft: (accountId: string) => ArticleOverrideDraft;
  setDraft: (accountId: string, draft: ArticleOverrideDraft) => void;
  commonTitle: string;
  commonCovers: CoverPair;
  accountIssues: Map<string, string[]>;
  onAdd: () => void;
  onRemove: (accountIds: string[]) => void;
  onBulkEdit: (accountIds: string[]) => void;
  onEditCover: (
    accountId: string,
    aspect: CoverKind,
    extraIndex?: 0 | 1,
  ) => void;
}) {
  return (
    <DistributionAccountsPanel
      entries={entries}
      accountsEmpty={accountsEmpty}
      disabled={disabled}
      focusedAccountId={focusedAccountId}
      onFocusAccount={onFocusAccount}
      onAdd={onAdd}
      onRemove={onRemove}
      onBulkEdit={onBulkEdit}
      renderStatus={({ account }) => (
        <RowStatus
          account={account}
          draft={getDraft(account.id)}
          commonCovers={commonCovers}
          issues={accountIssues.get(account.id) ?? []}
        />
      )}
    >
      <ArticleAccountEditor
        entries={entries}
        accountId={focusedAccountId}
        onNavigate={onFocusAccount}
        getDraft={getDraft}
        setDraft={setDraft}
        commonTitle={commonTitle}
        commonCovers={commonCovers}
        disabled={disabled}
        onEditCover={onEditCover}
        className="min-h-[28rem] lg:min-h-[32rem]"
      />
    </DistributionAccountsPanel>
  );
}

function RowStatus({
  account,
  draft,
  commonCovers,
  issues,
}: {
  account: PlatformAccountItem;
  draft: ArticleOverrideDraft;
  commonCovers: CoverPair;
  issues: string[];
}) {
  if (account.status !== "active") {
    return (
      <Badge variant="outline" className="shrink-0">
        {ACCOUNT_STATUS_TEXT[account.status]}
      </Badge>
    );
  }
  if (issues.length > 0) {
    return (
      <Badge variant="destructive" className="shrink-0">
        {issues[0]}
      </Badge>
    );
  }
  if (missingRequiredCovers(draft, commonCovers, account.platform).length > 0) {
    return (
      <Badge variant="outline" className="shrink-0">
        缺封面
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0">
      <CircleCheck data-icon="inline-start" />
      就绪
    </Badge>
  );
}
