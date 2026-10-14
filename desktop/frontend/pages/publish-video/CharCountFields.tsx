import { forwardRef, useId, type ComponentProps } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function countClassName(over: boolean): string {
  return cn(
    "text-xs tabular-nums",
    over ? "text-destructive" : "text-muted-foreground",
  );
}

/** 单行输入 + 框内右侧字数；超出 max 仍可输入，计数变红 */
export const CharCountInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<"input">, "value" | "maxLength"> & {
    value: string;
    max: number;
    countCharacters?: (value: string) => number;
    validationMessage?: string;
  }
>(function CharCountInput(
  { value, max, countCharacters, validationMessage, className, ...props },
  ref,
) {
  const length = countCharacters ? countCharacters(value) : value.length;
  const over = length > max;
  const errorId = useId();
  const error = validationMessage || (over ? `最多 ${max} 字` : "");

  return (
    <>
      <InputGroup className="has-[>[data-align=inline-end]]:[&>input]:pr-14">
        <InputGroupInput
          ref={ref}
          value={value}
          className={className}
          {...props}
          aria-invalid={Boolean(error) || props["aria-invalid"] || undefined}
          aria-describedby={
            [props["aria-describedby"], error ? errorId : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <InputGroupAddon align="inline-end" className="pointer-events-none">
          <span className={countClassName(over)} aria-hidden>
            {length}/{max}
          </span>
        </InputGroupAddon>
      </InputGroup>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </>
  );
});

/** 多行输入 + 框内右下角字数；超出 max 仍可输入，计数变红 */
export const CharCountTextarea = forwardRef<
  HTMLTextAreaElement,
  Omit<ComponentProps<"textarea">, "value" | "maxLength"> & {
    value: string;
    max: number;
    countCharacters?: (value: string) => number;
    validationMessage?: string;
  }
>(function CharCountTextarea(
  { value, max, countCharacters, validationMessage, className, ...props },
  ref,
) {
  const length = countCharacters ? countCharacters(value) : value.length;
  const over = length > max;
  const errorId = useId();
  const error = validationMessage || (over ? `最多 ${max} 字` : "");

  return (
    <>
      <InputGroup className="h-auto items-stretch has-[>textarea]:h-auto">
        <InputGroupTextarea
          ref={ref}
          value={value}
          className={cn("min-h-24 pb-7", className)}
          {...props}
          aria-invalid={Boolean(error) || props["aria-invalid"] || undefined}
          aria-describedby={
            [props["aria-describedby"], error ? errorId : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <InputGroupAddon
          align="block-end"
          className="pointer-events-none w-full justify-end pt-0"
        >
          <span className={countClassName(over)} aria-hidden>
            {length}/{max}
          </span>
        </InputGroupAddon>
      </InputGroup>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </>
  );
});
