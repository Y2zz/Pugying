import { useEffect, useId, useState } from "react";
import { Hash, X } from "lucide-react";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PlatformResourceSearchFn = (
  keyword: string,
) => Promise<PlatformResourceRef[]>;

/**
 * 平台资源搜索选择：只接受真实候选项。
 * 扩展项可默认折叠并展示已选摘要；话题等主字段可始终展开。
 */
export function PlatformResourcePicker({
  label,
  value,
  onChange,
  search,
  maxCount = 1,
  disabled,
  invalid,
  error,
  description,
  placeholder = "搜索并选择",
  collapsedByDefault = false,
  /** 合集/文集等账号列表：展开后空关键词也拉取候选项 */
  browseOnEmpty = false,
  emptySummary = "未选择",
}: {
  label: string;
  value: PlatformResourceRef[];
  onChange: (next: PlatformResourceRef[]) => void;
  search: PlatformResourceSearchFn;
  maxCount?: number;
  disabled?: boolean;
  invalid?: boolean;
  error?: string;
  description?: string;
  placeholder?: string;
  collapsedByDefault?: boolean;
  browseOnEmpty?: boolean;
  emptySummary?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(!collapsedByDefault || value.length > 0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlatformResourceRef[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    // 折叠未展开时不请求，避免后台空跑账号资源列表
    if (collapsedByDefault && !open) {
      return;
    }
    const keyword = query.trim().replace(/^#+/, "");
    if (!keyword && !browseOnEmpty) {
      setSuggestions([]);
      setLoading(false);
      setSearchFailed(false);
      return;
    }
    let active = true;
    setLoading(true);
    setSearchFailed(false);
    const timer = window.setTimeout(() => {
      void search(keyword)
        .then((items) => {
          if (!active) {
            return;
          }
          setSuggestions(items);
          setLoading(false);
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setSuggestions([]);
          setSearchFailed(true);
          setLoading(false);
        });
    }, keyword ? 300 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, search, browseOnEmpty, collapsedByDefault, open]);

  const summary =
    value.length > 0
      ? value.map((item) => `#${item.name}`).join(" · ")
      : emptySummary;
  const atLimit = value.length >= maxCount;

  const add = (item: PlatformResourceRef) => {
    if (disabled || atLimit) {
      return;
    }
    if (
      value.some(
        (current) =>
          (item.id !== "0" && current.id === item.id) ||
          current.name.toLowerCase() === item.name.toLowerCase(),
      )
    ) {
      return;
    }
    onChange([...value, item].slice(0, maxCount));
    setQuery("");
    setSuggestions([]);
  };

  const remove = (item: PlatformResourceRef) => {
    if (disabled) {
      return;
    }
    onChange(
      value.filter((current) =>
        item.id !== "0"
          ? current.id !== item.id
          : current.name !== item.name,
      ),
    );
  };

  const body = (
    <Field data-invalid={Boolean(error) || undefined} className="gap-2">
      {!collapsedByDefault ? (
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
      ) : null}
      <Input
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={placeholder}
        disabled={disabled || atLimit}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {loading ? (
        <p className="text-xs text-muted-foreground">正在搜索…</p>
      ) : null}
      {searchFailed ? (
        <p className="text-xs text-muted-foreground">暂时无法搜索，请稍后重试</p>
      ) : null}
      {!loading &&
      (query.trim() || browseOnEmpty) &&
      suggestions.length === 0 &&
      !searchFailed ? (
        <p className="text-xs text-muted-foreground">
          {browseOnEmpty && !query.trim()
            ? "暂无可选项"
            : "没有匹配的候选项"}
        </p>
      ) : null}
      {suggestions.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border p-1">
          {suggestions.map((item) => {
            const selected = value.some(
              (current) =>
                (item.id !== "0" && current.id === item.id) ||
                current.name.toLowerCase() === item.name.toLowerCase(),
            );
            return (
              <li key={`${item.id}-${item.name}`}>
                <button
                  type="button"
                  disabled={disabled || selected || atLimit}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                  onClick={() => {
                    add(item);
                  }}
                >
                  <Hash className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <Badge
              key={`${item.id}-${item.name}`}
              variant="secondary"
              className="gap-1"
            >
              <Hash />
              {item.name}
              {!disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="ml-0.5 size-4 opacity-60 hover:opacity-100"
                  onClick={() => {
                    remove(item);
                  }}
                >
                  <X />
                  <span className="sr-only">移除 {item.name}</span>
                </Button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : description ? (
        <FieldDescription className="text-xs">{description}</FieldDescription>
      ) : null}
    </Field>
  );

  if (!collapsedByDefault) {
    return body;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-col gap-2">
        <CollapsibleTrigger
          className="flex w-full items-center justify-between gap-2 text-left text-sm"
          disabled={disabled}
        >
          <span>{label}</span>
          <span className="truncate text-muted-foreground">{summary}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>{body}</CollapsibleContent>
      </div>
    </Collapsible>
  );
}
