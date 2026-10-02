import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, CircleCheck, CircleDashed, Save } from 'lucide-react';
import {
  PageHeader,
  PageHeaderAction,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@/components/layouts/PageHeader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ArticleChecklistBar } from './ArticleChecklistCard';
import type { ArticleCheck } from './use-article-composer';

export function ArticlePageHeader({
  title,
  description,
  checks,
  loading,
  disabled,
  saveLabel,
  onSave,
  onFix,
}: {
  title: string;
  description: string;
  checks: ArticleCheck[];
  loading: boolean;
  disabled: boolean;
  saveLabel: string;
  onSave: () => void;
  onFix: (check: ArticleCheck) => void;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const fixingRef = useRef(false);
  const [compact, setCompact] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState<number>();
  const [checksOpen, setChecksOpen] = useState(false);
  const pending = checks.filter((check) => !check.ok).length;

  useLayoutEffect(() => {
    const scroller = headerRef.current?.closest('main');
    if (!scroller) {
      return;
    }
    const update = () => {
      setCompact(scroller.scrollTop > 80);
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', update);
    };
  }, []);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || compact) {
      return;
    }
    const measure = () => {
      setExpandedHeight(surface.getBoundingClientRect().height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => {
      observer.disconnect();
    };
  }, [compact]);

  return (
    <div
      ref={headerRef}
      data-compact={compact}
      className="pointer-events-none sticky top-0 z-30 -mt-4 md:-mt-6"
      // 保留展开时的文档高度，避免收起触发滚动锚定；透明区域允许正文点击穿透。
      style={{ height: expandedHeight }}
    >
      <div
        ref={surfaceRef}
        data-slot="article-page-header-surface"
        className={cn(
          'pointer-events-auto relative -mx-4 flex flex-col border-b bg-background px-4 md:-mx-6 md:px-6',
          compact ? 'py-3' : 'gap-4 py-4 md:py-6',
        )}
      >
        <PageHeader className={compact ? 'flex items-center gap-2' : undefined}>
          <PageHeaderTitle className={compact ? 'min-w-0 flex-1 truncate text-base' : undefined}>
            {title}
          </PageHeaderTitle>
          {!compact ? <PageHeaderDescription>{description}</PageHeaderDescription> : null}
          {compact && !loading ? (
            <Popover
              open={checksOpen}
              onOpenChange={(open) => {
                if (open) {
                  fixingRef.current = false;
                }
                setChecksOpen(open);
              }}
            >
              <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                {pending > 0 ? (
                  <CircleDashed data-icon="inline-start" />
                ) : (
                  <CircleCheck data-icon="inline-start" />
                )}
                {pending > 0 ? `还差 ${pending} 项` : '已就绪'}
                <ChevronDown data-icon="inline-end" />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="max-w-[calc(100vw-2rem)]"
                finalFocus={() => (fixingRef.current ? false : undefined)}
              >
                <PopoverTitle>发布检查</PopoverTitle>
                <ArticleChecklistBar
                  checks={checks}
                  onFix={(check) => {
                    fixingRef.current = true;
                    setChecksOpen(false);
                    onFix(check);
                  }}
                />
              </PopoverContent>
            </Popover>
          ) : null}
          <PageHeaderAction className={compact ? 'shrink-0 self-center' : undefined}>
            <Button type="button" size={compact ? 'sm' : 'default'} disabled={disabled} onClick={onSave}>
              <Save data-icon="inline-start" />
              {saveLabel}
            </Button>
          </PageHeaderAction>
        </PageHeader>
        {!compact && !loading ? <ArticleChecklistBar checks={checks} onFix={onFix} /> : null}
      </div>
    </div>
  );
}
