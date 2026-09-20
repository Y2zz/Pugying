import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { PublishFlowStepId } from './helpers';

export type PublishProgressAccount = {
  id: string;
  displayName: string;
};

/**
 * 流程第 4/5 步：提交发布与推送进度。
 * activeAccountId 由 publishHint 解析出的当前账号（若有）。
 */
export function PublishVideoProgressPanel({
  flowStep,
  publishHint,
  accounts,
  activeAccountLabel,
}: {
  flowStep: Extract<PublishFlowStepId, 'publish' | 'progress'>;
  publishHint: string;
  accounts: PublishProgressAccount[];
  /** 从 publishHint 提取的当前推送账号名，用于高亮列表行 */
  activeAccountLabel: string | null;
}) {
  const title = flowStep === 'publish' ? '正在发布' : '推送进度';
  const description =
    publishHint.trim() ||
    (flowStep === 'publish' ? '正在向后端申请发布并准备发布任务…' : '正在串行推送到各抖音账号…');

  return (
    <Card className="flex min-h-[350px] flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <Progress value={null}>
          <ProgressLabel>{flowStep === 'publish' ? '提交中' : '推送中'}</ProgressLabel>
        </Progress>
        {accounts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => {
              const active =
                activeAccountLabel != null &&
                (account.displayName === activeAccountLabel ||
                  description.includes(account.displayName));
              return (
                <li
                  key={account.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                    active ? 'border-primary/40 bg-primary/5' : 'bg-muted/20'
                  )}
                >
                  {active ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
                  ) : (
                    <span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/30" aria-hidden />
                  )}
                  <span className="truncate font-medium">{account.displayName}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** 从 publishHint 提取「开始推送「xxx」」或「xxx · phase」中的账号标签 */
export function parseActivePublishAccountLabel(hint: string): string | null {
  const trimmed = hint.trim();
  const pushMatch = trimmed.match(/开始推送「([^」]+)」/);
  if (pushMatch) {
    return pushMatch[1];
  }
  const phaseMatch = trimmed.match(/^([^·]+)\s·/);
  if (phaseMatch) {
    return phaseMatch[1].trim();
  }
  return null;
}
