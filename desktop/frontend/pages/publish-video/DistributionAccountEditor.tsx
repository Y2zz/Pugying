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
  commonCoverReady,
  commonCoverLandscapeReady,
  commonCoverPreviewUrl,
  commonCoverLandscapePreviewUrl,
  coverDisabled,
  disabled,
  className,
  onDraftChange,
  onEditCover,
  portraitOnly = false,
  /** 无外框/顶部分割线（图文页减线） */
  plain = false,
}: {
  account: PlatformAccountItem | null;
  platformLabel: string;
  draft: OverrideDraft;
  commonTitle: string;
  commonBody: string;
  commonCoverReady: boolean;
  commonCoverLandscapeReady: boolean;
  commonCoverPreviewUrl: string | null;
  commonCoverLandscapePreviewUrl: string | null;
  coverDisabled?: boolean;
  disabled?: boolean;
  className?: string;
  onDraftChange: (draft: OverrideDraft) => void;
  onEditCover: (kind: CoverKind) => void;
  portraitOnly?: boolean;
  plain?: boolean;
}) {
  if (!account) {
    return (
      <div
        className={cn(
          'flex min-h-48 items-center justify-center rounded-lg px-4 text-center text-muted-foreground',
          plain ? 'bg-muted/15' : 'border border-dashed bg-muted/20',
          className,
        )}
      >
        在左侧选择账号以配置发布选项
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col bg-background',
        plain ? 'rounded-lg' : 'rounded-lg border',
        className,
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-between gap-2 px-4 py-3',
          plain ? null : 'border-b',
        )}
      >
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
            // 重置会丢弃会话内封面预览 URL，需先 revoke 避免泄漏
            if (draft.coverPreviewUrl.startsWith('blob:')) {
              URL.revokeObjectURL(draft.coverPreviewUrl);
            }
            if (draft.coverLandscapePreviewUrl.startsWith('blob:')) {
              URL.revokeObjectURL(draft.coverLandscapePreviewUrl);
            }
            if (draft.coverSourceUrl.startsWith('blob:')) {
              URL.revokeObjectURL(draft.coverSourceUrl);
            }
            if (draft.coverLandscapeSourceUrl.startsWith('blob:')) {
              URL.revokeObjectURL(draft.coverLandscapeSourceUrl);
            }
            onDraftChange(emptyDraft());
          }}
        >
          重置
        </Button>
      </div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto', plain ? 'px-1 py-2' : 'p-4')}>
        <AccountOverrideForm
          account={account}
          draft={draft}
          commonTitle={commonTitle}
          commonBody={commonBody}
          commonCoverReady={commonCoverReady}
          commonCoverLandscapeReady={commonCoverLandscapeReady}
          commonCoverPreviewUrl={commonCoverPreviewUrl}
          commonCoverLandscapePreviewUrl={commonCoverLandscapePreviewUrl}
          coverDisabled={coverDisabled}
          disabled={disabled}
          onDraftChange={onDraftChange}
          onEditCover={onEditCover}
          portraitOnly={portraitOnly}
        />
      </div>
    </div>
  );
}
