import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ArticleRecoveryDialog({
  open,
  busy = false,
  error,
  onContinue,
  onNew,
}: {
  open: boolean;
  busy?: boolean;
  error?: string;
  onContinue: () => void;
  onNew: () => void;
}) {
  const continueRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          onContinue();
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-md" initialFocus={continueRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>有一份未完成的文章</AlertDialogTitle>
          <AlertDialogDescription>
            是否继续编辑本地草稿？新建文章会清除这份本地草稿。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogAction variant="outline" disabled={busy} onClick={onNew}>
            {busy ? "正在新建…" : "新建文章"}
          </AlertDialogAction>
          <AlertDialogAction
            ref={continueRef}
            disabled={busy}
            onClick={onContinue}
          >
            继续编辑
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
