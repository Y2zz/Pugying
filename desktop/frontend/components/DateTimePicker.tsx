import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import { CalendarIcon } from "lucide-react";
import { zhCN } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clampDateTime,
  formatLocalDateTime,
  getDateTimeWindow,
  getDayTimeRange,
  isDateTimeAllowed,
  padTimePart,
  parseLocalDateTime,
  type DateTimeLimits,
} from "@/lib/date-time";
import { cn } from "@/lib/utils";

export interface DateTimePickerProps
  extends
    DateTimeLimits,
    Pick<ComponentProps<"button">, "aria-invalid" | "aria-describedby"> {
  /** 本地时间字符串；保留该格式以兼容现有表单校验与提交转换。 */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: padTimePart(hour),
  label: `${padTimePart(hour)} 时`,
}));
const MINUTES = Array.from({ length: 60 }, (_, minute) => ({
  value: padTimePart(minute),
  label: `${padTimePart(minute)} 分`,
}));

/** 日历和时分选项都遵守同一时间窗口；保留本地字符串的提交契约。 */
export const DateTimePicker = forwardRef<
  HTMLButtonElement,
  DateTimePickerProps
>(function DateTimePicker(
  {
    value,
    onChange,
    disabled = false,
    min,
    max,
    minHours,
    maxDays,
    id,
    className,
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
  },
  ref,
) {
  const generatedId = useId();
  const timeId = `${id ?? generatedId}-time`;
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [now, setNow] = useState(Date.now);
  const saved = useMemo(() => parseLocalDateTime(value), [value]);
  const selected = useMemo(() => parseLocalDateTime(draftValue), [draftValue]);
  const window = useMemo(
    () => getDateTimeWindow({ min, max, minHours, maxDays }, now),
    [min, max, minHours, maxDays, now],
  );
  const range = selected ? getDayTimeRange(selected, window) : undefined;
  const hour = selected ? padTimePart(selected.getHours()) : null;
  const minute = selected ? padTimePart(selected.getMinutes()) : null;
  const hourAvailable = (candidate: number) =>
    Boolean(
      range && candidate * 60 <= range.max && candidate * 60 + 59 >= range.min,
    );
  const minuteAvailable = (candidate: number) =>
    Boolean(
      range &&
      selected &&
      selected.getHours() * 60 + candidate >= range.min &&
      selected.getHours() * 60 + candidate <= range.max,
    );
  const allowed = selected && isDateTimeAllowed(selected, window);

  // 弹窗打开时跟随时钟更新，停留较久也不能选到已过期的边界分钟。
  useEffect(() => {
    if (!open || (minHours === undefined && maxDays === undefined)) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        60_000 - (Date.now() % 60_000) + 1,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [open, minHours, maxDays]);

  const selectDate = (date: Date) => {
    const currentNow = Date.now();
    setNow(currentNow);
    const currentWindow = getDateTimeWindow(
      { min, max, minHours, maxDays },
      currentNow,
    );
    const next = clampDateTime(date, currentWindow);
    if (next && isDateTimeAllowed(next, currentWindow)) {
      setDraftValue(formatLocalDateTime(next));
    }
  };
  const defaultMonth = selected ? clampDateTime(selected, window) : window.min;
  const displayValue = saved
    ? `${saved.getFullYear()}年${padTimePart(saved.getMonth() + 1)}月${padTimePart(saved.getDate())}日 ${padTimePart(saved.getHours())}:${padTimePart(saved.getMinutes())}`
    : "选择日期时间";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setNow(Date.now());
        if (next) {
          setDraftValue(value);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            ref={ref}
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start font-normal",
              !saved && "text-muted-foreground",
              className,
            )}
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
          defaultMonth={defaultMonth}
          startMonth={window.min}
          endMonth={window.max}
          disabled={disabled ? true : (date) => !getDayTimeRange(date, window)}
          onSelect={(date) => {
            if (date && getDayTimeRange(date, window)) {
              const candidate = new Date(date);
              candidate.setHours(
                selected?.getHours() ?? new Date(now).getHours(),
                selected?.getMinutes() ?? new Date(now).getMinutes(),
              );
              selectDate(candidate);
            }
          }}
        />
        <div className="px-3 pb-3">
          <Field
            className="flex-1"
            data-disabled={disabled || !selected || undefined}
          >
            <FieldLabel htmlFor={`${timeId}-hour`} className="font-normal">
              时间
            </FieldLabel>
            <div className="flex gap-2">
              <Select
                value={hour}
                disabled={disabled || !selected || !range}
                items={[{ value: null, label: "时" }, ...HOURS]}
                onValueChange={(next) => {
                  if (
                    selected &&
                    next !== null &&
                    hourAvailable(Number(next))
                  ) {
                    const nextRange = getDayTimeRange(
                      selected,
                      getDateTimeWindow(
                        { min, max, minHours, maxDays },
                        Date.now(),
                      ),
                    );
                    if (!nextRange) {
                      return;
                    }
                    const minutes = Math.min(
                      nextRange.max,
                      Math.max(
                        nextRange.min,
                        Number(next) * 60 + selected.getMinutes(),
                      ),
                    );
                    const candidate = parseLocalDateTime(
                      `${formatLocalDateTime(selected).slice(0, 11)}${padTimePart(Math.floor(minutes / 60))}:${padTimePart(minutes % 60)}`,
                    );
                    if (candidate) {
                      selectDate(candidate);
                    }
                  }
                }}
              >
                <SelectTrigger
                  id={`${timeId}-hour`}
                  aria-label="小时"
                  className="flex-1"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {HOURS.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        disabled={!hourAvailable(Number(item.value))}
                      >
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={minute}
                disabled={
                  disabled || !selected || !hourAvailable(selected.getHours())
                }
                items={[{ value: null, label: "分" }, ...MINUTES]}
                onValueChange={(next) => {
                  if (
                    selected &&
                    next !== null &&
                    minuteAvailable(Number(next))
                  ) {
                    const candidate = parseLocalDateTime(
                      `${formatLocalDateTime(selected).slice(0, 14)}${next}`,
                    );
                    if (candidate) {
                      selectDate(candidate);
                    }
                  }
                }}
              >
                <SelectTrigger aria-label="分钟" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MINUTES.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        disabled={!minuteAvailable(Number(item.value))}
                      >
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 border-t p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || (!value && !draftValue)}
            aria-label="清空日期时间"
            onClick={() => {
              setDraftValue("");
              onChange("");
              setOpen(false);
            }}
          >
            清空
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled || !allowed}
            aria-label="确定日期时间"
            onClick={() => {
              const currentNow = Date.now();
              setNow(currentNow);
              if (
                selected &&
                isDateTimeAllowed(
                  selected,
                  getDateTimeWindow(
                    { min, max, minHours, maxDays },
                    currentNow,
                  ),
                )
              ) {
                onChange(formatLocalDateTime(selected));
                setOpen(false);
              }
            }}
          >
            确定
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
});
