import { CircleCheck, CircleDashed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ArticleCheck } from './use-article-composer';

/**
 * 发布检查：挂在页头，贴近「保存」。
 * 它是状态汇总而非创作步骤，不应插入主流程中间打断撰写与分发。
 */
export function ArticleChecklistBar({
  checks,
  onFix,
}: {
  checks: ArticleCheck[];
  onFix: (check: ArticleCheck) => void;
}) {
  const pending = checks.filter((c) => !c.ok);

  if (pending.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-primary" aria-hidden />
        已就绪，可以保存
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">还差</span>
      {pending.map((check) => (
        <button
          key={check.id}
          type="button"
          className="inline-flex"
          onClick={() => {
            onFix(check);
          }}
        >
          <Badge variant="outline" className={cn('gap-1.5 font-normal hover:bg-muted')}>
            <CircleDashed className="size-3.5" aria-hidden />
            {check.label}
            <span className="text-muted-foreground">{check.detail}</span>
          </Badge>
        </button>
      ))}
    </div>
  );
}
