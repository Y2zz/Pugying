import { DistributionAccountEditorFrame } from "@/components/publishing/DistributionAccountEditorFrame";
import type { CoverKind } from "@/lib/api";
import { GraphicPlatformAccountForm } from "./account-forms/GraphicPlatformAccountForm";
import {
  articleDraftHasCustomizations,
  emptyArticleDraft,
  type ArticleOverrideDraft,
  type CoverPair,
} from "../publish-article/helpers";
import type { GraphicRosterEntry } from "./use-graphic-composer";

export function GraphicAccountEditor({
  entries,
  accountId,
  onNavigate,
  getDraft,
  setDraft,
  commonTitle,
  commonBody,
  commonCovers,
  disabled,
  onEditCover,
  className,
}: {
  entries: GraphicRosterEntry[];
  accountId: string | null;
  onNavigate: (accountId: string) => void;
  getDraft: (accountId: string) => ArticleOverrideDraft;
  setDraft: (accountId: string, draft: ArticleOverrideDraft) => void;
  commonTitle: string;
  commonBody?: string;
  commonCovers: CoverPair;
  disabled?: boolean;
  onEditCover: (accountId: string, aspect: CoverKind) => void;
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
      dataSlot="graphic-account-editor"
      onReset={() => {
        if (entry) {
          setDraft(entry.account.id, emptyArticleDraft());
        }
      }}
    >
      {entry ? (
        <GraphicPlatformAccountForm
          key={entry.account.id}
          account={entry.account}
          draft={draft}
          commonTitle={commonTitle}
          commonBody={commonBody}
          commonCovers={commonCovers}
          disabled={disabled}
          onDraftChange={(next) => {
            setDraft(entry.account.id, next);
          }}
          onEditCover={(aspect) => {
            onEditCover(entry.account.id, aspect);
          }}
        />
      ) : null}
    </DistributionAccountEditorFrame>
  );
}
