import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ReactNode } from "react";
import type { DistributionAccountEntry } from "./DistributionAccountsPanel";
import { cn } from "@/lib/utils";

/**
 * 单账号设置面板（非抽屉）：嵌在分发区右侧 / 窄屏列表下方。
 * 可上一个 / 下一个连续调整，避免反复开关遮罩。
 */
export function DistributionAccountEditorFrame({
  entries,
  accountId,
  onNavigate,
  disabled,
  onReset,
  resetDisabled,
  className,
  children,
  dataSlot = "distribution-account-editor",
}: {
  entries: DistributionAccountEntry[];
  accountId: string | null;
  onNavigate: (id: string) => void;
  disabled?: boolean;
  onReset: () => void;
  resetDisabled?: boolean;
  className?: string;
  children: ReactNode;
  dataSlot?: string;
}) {
  const index = entries.findIndex((e) => e.account.id === accountId);
  const entry = index >= 0 ? entries[index] : null;
  const prev = index > 0 ? entries[index - 1] : null;
  const next =
    index >= 0 && index < entries.length - 1 ? entries[index + 1] : null;

  if (!entry) {
    return (
      <div
        className={cn(
          "flex min-h-48 items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground",
          className,
        )}
      >
        选择左侧账号以调整发布选项
      </div>
    );
  }

  return (
    <div
      data-slot={dataSlot}
      data-account-id={entry.account.id}
      className={cn("flex min-h-0 flex-col rounded-lg border", className)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            {entry.account.avatarUrl ? (
              <AvatarImage
                src={entry.account.avatarUrl}
                alt={entry.account.displayName}
                referrerPolicy="no-referrer"
              />
            ) : null}
            <AvatarFallback>
              {entry.account.displayName.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{entry.account.displayName}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PlatformIcon
                platform={entry.account.platform}
                className="size-3.5 rounded-[3px]"
              />
              {entry.platformLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={disabled || resetDisabled}
            onClick={onReset}
          >
            <RotateCcw data-icon="inline-start" />
            恢复默认
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {entries.length > 1 ? (
            <>
              <span className="mr-1 text-xs text-muted-foreground tabular-nums">
                {index + 1}/{entries.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="上一个账号"
                disabled={!prev}
                onClick={() => {
                  if (prev) {
                    onNavigate(prev.account.id);
                  }
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="下一个账号"
                disabled={!next}
                onClick={() => {
                  if (next) {
                    onNavigate(next.account.id);
                  }
                }}
              >
                <ChevronRight />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {entry.account.status !== "active" ? (
          <Alert className="mb-6">
            <AlertCircle />
            <AlertDescription>
              该账号需重新授权，
              <Link
                to="/platform-accounts"
                className="underline underline-offset-4"
              >
                去处理
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
        {children}
      </div>
    </div>
  );
}
