import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlatformAccountItem } from '@/lib/api';
import { AccountOverrideForm } from './AccountRuleEditor';
import { emptyDraft, type CoverKind, type OverrideDraft } from './helpers';

/** 主从布局右侧：仅渲染当前选中账号的一份发布表单 */
export function DistributionAccountEditor({
  account,
  platformLabel,
  draft,
  commonTitle,
  commonBody,
  commonCoverUrl,
  commonCoverLandscapeUrl,
  commonCoverPreviewUrl,
  commonCoverLandscapePreviewUrl,
  coverDisabled,
  disabled,
  className,
  onDraftChange,
  onEditCover,
}: {
  account: PlatformAccountItem | null;
  platformLabel: string;
  draft: OverrideDraft;
  commonTitle: string;
  commonBody: string;
  commonCoverUrl: string;
  commonCoverLandscapeUrl: string;
  commonCoverPreviewUrl: string | null;
  commonCoverLandscapePreviewUrl: string | null;
  coverDisabled?: boolean;
  disabled?: boolean;
  className?: string;
  onDraftChange: (draft: OverrideDraft) => void;
  onEditCover: (kind: CoverKind) => void;
}) {
  if (!account) {
    return (
      <div
        className={cn(
          'flex min-h-48 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center text-muted-foreground',
          className
        )}
      >
        在左侧选择账号以配置发布选项
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col rounded-lg border bg-background', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <Badge variant="outline" className="mr-2 font-normal">
              {platformLabel}
            </Badge>
            {account.displayName}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onDraftChange(emptyDraft());
          }}
        >
          重置
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <AccountOverrideForm
          account={account}
          draft={draft}
          commonTitle={commonTitle}
          commonBody={commonBody}
          commonCoverUrl={commonCoverUrl}
          commonCoverLandscapeUrl={commonCoverLandscapeUrl}
          commonCoverPreviewUrl={commonCoverPreviewUrl}
          commonCoverLandscapePreviewUrl={commonCoverLandscapePreviewUrl}
          coverDisabled={coverDisabled}
          disabled={disabled}
          onDraftChange={onDraftChange}
          onEditCover={onEditCover}
        />
      </div>
    </div>
  );
}
