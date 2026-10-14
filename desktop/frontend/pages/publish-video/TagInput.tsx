import { useState } from "react";
import { Hash, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTags } from "./helpers";

/** 话题输入：回车分词，Badge 展示，可删除 */
export function TagInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  errorId,
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const parsed = parseTags(draft);
    if (parsed.length > 0) {
      onChange([...new Set([...value, ...parsed])]);
    }
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          placeholder="输入话题后回车，如：美食 vlog"
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </div>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              <Hash />
              {tag}
              {!disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="ml-0.5 size-4 opacity-60 hover:opacity-100"
                  onClick={() => {
                    onChange(value.filter((t) => t !== tag));
                  }}
                >
                  <X />
                  <span className="sr-only">移除 {tag}</span>
                </Button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
