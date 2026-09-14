import { forwardRef, useMemo, useState } from 'react';
import { CalendarIcon, Clock, X } from 'lucide-react';
import { zhCN } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface DateTimePickerProps {
  /** 本地时间字符串；保留该格式以兼容现有表单校验与提交转换。 */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  min?: string;
  id?: string;
  className?: string;
}

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseLocalDateTime(value: string): Date | undefined {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute)
  ) {
    return undefined;
  }
  return date;
}

function formatValue(date: Date, time: string): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
}

function sameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

/** Calendar 负责日期、原生 time 输入负责时间，但对外始终维持既有本地字符串契约。 */
export const DateTimePicker = forwardRef<HTMLButtonElement, DateTimePickerProps>(function DateTimePicker(
  { value, onChange, disabled = false, min, id, className },
  ref
) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseLocalDateTime(value), [value]);
  const minimum = useMemo(() => parseLocalDateTime(min ?? ''), [min]);
  const time = selected ? `${pad(selected.getHours())}:${pad(selected.getMinutes())}` : '';
  const minimumDay = minimum ? new Date(minimum.getFullYear(), minimum.getMonth(), minimum.getDate()) : undefined;
  const minimumTime = selected && minimum && sameLocalDay(selected, minimum) ? `${pad(minimum.getHours())}:${pad(minimum.getMinutes())}` : undefined;

  const displayValue = selected ? `${selected.getFullYear()}年${pad(selected.getMonth() + 1)}月${pad(selected.getDate())}日 ${time}` : '选择日期时间';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            ref={ref}
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn('w-full justify-start font-normal', !selected && 'text-muted-foreground', className)}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        <span className="truncate">{displayValue}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={zhCN}
          selected={selected}
          defaultMonth={selected ?? minimum}
          disabled={disabled ? true : minimumDay ? { before: minimumDay } : undefined}
          onSelect={(date) => {
            if (date) {
              onChange(formatValue(date, time || '00:00'));
            }
          }}
        />
        <div className="flex items-end gap-2 px-3 pb-3">
          <Field className="flex-1">
            <FieldLabel htmlFor={id ? `${id}-time` : undefined}>时间</FieldLabel>
            <Input
              id={id ? `${id}-time` : undefined}
              type="time"
              value={time}
              min={minimumTime}
              disabled={disabled || !selected}
              onChange={(event) => {
                if (!event.target.value) {
                  onChange('');
                } else if (selected) {
                  onChange(formatValue(selected, event.target.value));
                }
              }}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || !value}
            aria-label="清空日期时间"
            onClick={() => {
              onChange('');
            }}
          >
            <X />
          </Button>
          <Button
            type="button"
            size="icon"
            disabled={disabled || !selected}
            aria-label="完成日期时间选择"
            onClick={() => {
              setOpen(false);
            }}
          >
            <Clock />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
});
