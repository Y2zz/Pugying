import { forwardRef, type ComponentProps } from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

function countClassName(over: boolean): string {
  return cn('text-xs tabular-nums', over ? 'text-destructive' : 'text-muted-foreground');
}

/** 单行输入 + 框内右侧字数；超出 max 仍可输入，计数变红 */
export const CharCountInput = forwardRef<HTMLInputElement, Omit<ComponentProps<'input'>, 'value' | 'maxLength'> & { value: string; max: number; countCharacters?: (value: string) => number }>(
  function CharCountInput({ value, max, countCharacters, className, ...props }, ref) {
    const length = countCharacters ? countCharacters(value) : value.length;
    const over = length > max;

    return (
      <InputGroup className="has-[>[data-align=inline-end]]:[&>input]:pr-14">
        <InputGroupInput ref={ref} value={value} aria-invalid={over || undefined} className={className} {...props} />
        <InputGroupAddon align="inline-end" className="pointer-events-none">
          <span className={countClassName(over)} aria-hidden>
            {length}/{max}
          </span>
        </InputGroupAddon>
      </InputGroup>
    );
  }
);

/** 多行输入 + 框内右下角字数；超出 max 仍可输入，计数变红 */
export const CharCountTextarea = forwardRef<
  HTMLTextAreaElement,
  Omit<ComponentProps<'textarea'>, 'value' | 'maxLength'> & {
    value: string;
    max: number;
  }
>(function CharCountTextarea({ value, max, className, ...props }, ref) {
  const over = value.length > max;

  return (
    <InputGroup className="h-auto items-stretch has-[>textarea]:h-auto">
      <InputGroupTextarea
        ref={ref}
        value={value}
        aria-invalid={over || undefined}
        className={cn('min-h-24 pb-7', className)}
        {...props}
      />
      <InputGroupAddon align="block-end" className="pointer-events-none w-full justify-end pt-0">
        <span className={countClassName(over)} aria-hidden>
          {value.length}/{max}
        </span>
      </InputGroupAddon>
    </InputGroup>
  );
});
