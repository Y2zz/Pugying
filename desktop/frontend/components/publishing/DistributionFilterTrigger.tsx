import {
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 宽度固定（w-36），选中前后与 ✕ 出现时都不变，长文字省略号截断。
 *
 * 工具栏筛选按钮：已选内容写进按钮（「平台 · 抖音」「账号 · 3」），选中后填充底色，
 * 右侧内嵌清除按钮（独立点击区域，不会打开浮层）。
 *
 * 外层容器始终存在且结构不变，作为浮层的定位参照（anchorRef）；触发按钮不会因
 * 选中状态切换而重建，否则浮层会失去参照、跑到窗口左上角。
 */
export function DistributionFilterTrigger({
  name,
  icon,
  selection,
  onClear,
  renderTrigger,
  anchorRef,
  className,
}: {
  /** 覆盖定宽（默认 w-36） */
  className?: string;
  /** 整个按钮的容器，用作浮层定位参照 */
  anchorRef: Ref<HTMLDivElement>;
  /** 筛选名，如「平台」 */
  name: string;
  icon: ReactNode;
  /** 已选内容的简述；为空表示未筛选 */
  selection: string | null;
  onClear: () => void;
  /** 由调用方包一层 PopoverTrigger */
  renderTrigger: (button: ReactElement, label: ReactNode) => ReactNode;
}) {
  // 鼠标打开/关闭浮层时，Base UI 会把焦点还给触发按钮，浏览器可能把它判为 focus-visible；
  // 记录最近一次是指针操作，指针操作后不显示焦点框，键盘操作后恢复。
  const [pointer, setPointer] = useState(false);
  useEffect(() => {
    if (!pointer) {
      return;
    }
    // 任何键盘操作（包括从别处 Tab 进来）都恢复焦点框
    const reset = () => setPointer(false);
    window.addEventListener("keydown", reset, true);
    return () => window.removeEventListener("keydown", reset, true);
  }, [pointer]);
  const full = selection ? `${name} · ${selection}` : name;
  const label = (
    <>
      {icon}
      <span className="truncate">{full}</span>
    </>
  );
  const button = (
    <button
      type="button"
      data-filter-trigger=""
      title={selection ? full : undefined}
      className={cn(
        "flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pl-2.5 text-sm font-medium outline-none [&_svg]:size-4 [&_svg]:shrink-0",
        selection ? "pr-1" : "pr-2.5",
      )}
    />
  );
  return (
    <div
      ref={anchorRef}
      data-selected={selection ? "" : undefined}
      onPointerDown={() => setPointer(true)}
      className={cn(
        // 焦点框画在整个外层（含 ✕）；✕ 自己聚焦时只显示它的圆形内框，两者不会同时出现
        "flex h-9 w-36 shrink-0 items-center rounded-md shadow-xs transition-colors",
        className,
        !pointer &&
          "has-[[data-filter-trigger]:focus-visible]:ring-3 has-[[data-filter-trigger]:focus-visible]:ring-ring/50",
        selection
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border bg-background hover:bg-muted",
      )}
    >
      {renderTrigger(button, label)}
      {selection ? (
        <button
          type="button"
          aria-label={`清除${name}筛选`}
          onClick={onClear}
          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-primary-foreground/70 outline-none hover:text-primary-foreground focus-visible:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-inset"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
