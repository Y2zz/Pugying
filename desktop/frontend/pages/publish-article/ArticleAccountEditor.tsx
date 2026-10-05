import { DistributionAccountEditorFrame } from "@/components/publishing/DistributionAccountEditorFrame";
import type { CoverKind } from "@/lib/api";
import { ArticlePlatformAccountForm } from "./account-forms/ArticlePlatformAccountForm";
import {
  articleDraftHasCustomizations,
  emptyArticleDraft,
  type ArticleOverrideDraft,
  type CoverPair,
} from "../publish-article/helpers";
import type { ArticleRosterEntry } from "./use-article-composer";

export function ArticleAccountEditor({
  entries,
  accountId,
  onNavigate,
  getDraft,
  setDraft,
  commonTitle,
  commonCovers,
  disabled,
  onEditCover,
  className,
}: {
  entries: ArticleRosterEntry[];
  accountId: string | null;
  onNavigate: (accountId: string) => void;
  getDraft: (accountId: string) => ArticleOverrideDraft;
  setDraft: (accountId: string, draft: ArticleOverrideDraft) => void;
  commonTitle: string;
  commonCovers: CoverPair;
  disabled?: boolean;
  onEditCover: (
    accountId: string,
    aspect: CoverKind,
    extraIndex?: 0 | 1,
  ) => void;
  className?: string;
}) {
  const entry = entries.find((item) => item.account.id === accountId);
  const draft = entry ? getDraft(entry.account.id) : emptyArticleDraft();
  return (
    <DistributionAccountEditorFrame
      entries={entries}
      accountId={accountId}
      onNavigate={onNavigate}
      disabled={disabled}
      className={className}
      resetDisabled={!articleDraftHasCustomizations(draft)}
      dataSlot="article-account-editor"
      onReset={() => {
        if (entry) {
          setDraft(entry.account.id, emptyArticleDraft());
        }
      }}
    >
      {entry ? (
        <ArticlePlatformAccountForm
          key={entry.account.id}
          account={entry.account}
          draft={draft}
          commonTitle={commonTitle}
          commonCovers={commonCovers}
          disabled={disabled}
          onDraftChange={(next) => {
            setDraft(entry.account.id, next);
          }}
          onEditCover={(aspect, extraIndex) => {
            onEditCover(entry.account.id, aspect, extraIndex);
          }}
        />
      ) : null}
    </DistributionAccountEditorFrame>
  );
}
