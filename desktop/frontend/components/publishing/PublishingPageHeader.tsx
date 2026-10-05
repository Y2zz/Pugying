import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, CircleCheck, CircleDashed, Save } from "lucide-react";
import {
  PageHeader,
  PageHeaderAction,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function PublishingPageHeader<T extends { ok: boolean }>({
  title,
  description,
  checks,
  loading,
  disabled,
  saveLabel,
  onSave,
  onFix,
  autoSaveStatus,
  autoSaveFailed,
  onRetryAutoSave,
  renderChecks,
  actions,
  saveVariant = "default",
  surfaceSlot = "publishing-page-header-surface",
}: {
  title: string;
  description: string;
  checks: T[];
  loading: boolean;
  disabled: boolean;
  saveLabel: string;
  onSave: () => void;
  onFix: (check: T) => void;
  autoSaveStatus?: string;
  autoSaveFailed?: boolean;
  onRetryAutoSave?: () => void;
  renderChecks: (onFix: (check: T) => void) => ReactNode;
  actions?: ReactNode;
  saveVariant?: "default" | "outline";
  surfaceSlot?: string;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const fixingRef = useRef(false);
  const [compact, setCompact] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState<number>();
  const [checksOpen, setChecksOpen] = useState(false);
  const pending = checks.filter((check) => !check.ok).length;

  useLayoutEffect(() => {
    const scroller = headerRef.current?.closest("main");
    if (!scroller) {
      return;
    }
    const update = () => {
      setCompact(scroller.scrollTop > 80);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", update);
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

  const autoSaveInfo =
    autoSaveStatus || autoSaveFailed ? (
      <div
        data-slot="publishing-autosave-status"
        className="flex min-w-0 items-center gap-2"
      >
        {autoSaveStatus ? (
          <span
            role="status"
            className={cn(
              "text-xs",
              autoSaveFailed ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {autoSaveStatus}
          </span>
        ) : null}
        {autoSaveFailed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onRetryAutoSave}
          >
            重试
          </Button>
        ) : null}
      </div>
    ) : null;

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
        data-slot={surfaceSlot}
        className={cn(
          "pointer-events-auto relative -mx-4 flex flex-col border-b bg-background px-4 md:-mx-6 md:px-6",
          compact ? "py-3" : "gap-4 py-4 md:py-6",
        )}
      >
        <PageHeader className={compact ? "flex items-center gap-2" : undefined}>
          <PageHeaderTitle
            className={
              compact ? "min-w-0 shrink-0 truncate text-base" : undefined
            }
          >
            {title}
          </PageHeaderTitle>
          {!compact ? (
            <PageHeaderDescription>{description}</PageHeaderDescription>
          ) : null}
          {compact && !loading ? (
            <div
              data-slot="publishing-status-group"
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
            >
              <Popover
                open={checksOpen}
                onOpenChange={(open) => {
                  if (open) {
                    fixingRef.current = false;
                  }
                  setChecksOpen(open);
                }}
              >
                <PopoverTrigger
                  render={<Button type="button" variant="ghost" size="sm" />}
                >
                  {pending > 0 ? (
                    <CircleDashed data-icon="inline-start" />
                  ) : (
                    <CircleCheck data-icon="inline-start" />
                  )}
                  {pending > 0 ? `还差 ${pending} 项` : "已就绪"}
                  <ChevronDown data-icon="inline-end" />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="max-w-[calc(100vw-2rem)]"
                  finalFocus={() => (fixingRef.current ? false : undefined)}
                >
                  <PopoverTitle>发布检查</PopoverTitle>
                  {renderChecks((check) => {
                    fixingRef.current = true;
                    setChecksOpen(false);
                    onFix(check);
                  })}
                </PopoverContent>
              </Popover>{" "}
              {autoSaveInfo}
            </div>
          ) : null}
          <PageHeaderAction
            className={compact ? "shrink-0 self-center" : undefined}
          >
            <Button
              type="button"
              size={compact ? "sm" : "default"}
              disabled={disabled}
              variant={saveVariant}
              onClick={onSave}
            >
              <Save data-icon="inline-start" />
              {saveLabel}
            </Button>
            {actions}
          </PageHeaderAction>
        </PageHeader>
        {!compact && !loading ? (
          <div
            data-slot="publishing-status-group"
            className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4"
          >
            {renderChecks(onFix)}
            {autoSaveInfo}
          </div>
        ) : null}
      </div>
    </div>
  );
}
