import type { ComponentProps } from "react";
import type { PlatformAccountItem } from "@/lib/api";
import { DistributionAccountEditorFrame } from "@/components/publishing/DistributionAccountEditorFrame";
import type { DistributionAccountEntry } from "@/components/publishing/DistributionAccountsPanel";
import { AccountOverrideForm } from "./AccountRuleEditor";
import {
  emptyDraft,
  optionalOverrideCount,
  type OverrideDraft,
} from "./helpers";

function revokeDraftBlobUrls(draft: OverrideDraft) {
  // 重置会丢弃会话内封面预览 URL，需先 revoke 避免泄漏
  if (draft.coverPreviewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(draft.coverPreviewUrl);
  }
  if (draft.coverLandscapePreviewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(draft.coverLandscapePreviewUrl);
  }
  if (draft.coverSourceUrl.startsWith("blob:")) {
    URL.revokeObjectURL(draft.coverSourceUrl);
  }
  if (draft.coverLandscapeSourceUrl.startsWith("blob:")) {
    URL.revokeObjectURL(draft.coverLandscapeSourceUrl);
  }
}

/** 视频字段复用统一账号编辑框架。 */
export function DistributionAccountEditor({
  entries,
  onNavigate,
  account,
  platformLabel: _platformLabel,
  className,
  ...formProps
}: Omit<ComponentProps<typeof AccountOverrideForm>, "account"> & {
  account: PlatformAccountItem | null;
  platformLabel: string;
  entries: DistributionAccountEntry[];
  onNavigate: (id: string) => void;
  className?: string;
}) {
  const { draft, disabled, onDraftChange } = formProps;
  const customized =
    optionalOverrideCount(draft) > 0 ||
    Boolean(
      draft.tagsText ||
      draft.scheduledLocal ||
      draft.location ||
      draft.partition,
    ) ||
    draft.visibility !== "public" ||
    !draft.allowDownload ||
    Boolean(draft.authorDeclaration && draft.authorDeclaration !== "none");
  return (
    <DistributionAccountEditorFrame
      entries={entries}
      accountId={account?.id ?? null}
      onNavigate={onNavigate}
      disabled={disabled}
      resetDisabled={!customized}
      className={className}
      dataSlot="video-account-editor"
      onReset={() => {
        revokeDraftBlobUrls(draft);
        onDraftChange(emptyDraft());
      }}
    >
      {account ? (
        <AccountOverrideForm
          key={account.id}
          account={account}
          {...formProps}
        />
      ) : null}
    </DistributionAccountEditorFrame>
  );
}
