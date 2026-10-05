import { DateTimePicker } from "@/components/DateTimePicker";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatLocalDateTime, getDateTimeWindow } from "@/lib/date-time";
import { localInputToIso } from "../../publish-article/helpers";
import { validateGraphicSchedule } from "../graphic-platform-fields";

export function DouyinPublishTimeField({
  accountId,
  value,
  disabled,
  onChange,
}: {
  accountId: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = `graphic-${accountId}-publish-time`;
  const scheduled = Boolean(value.trim());
  const limits = { minHours: 2, maxDays: 14 };
  const iso = localInputToIso(value);
  const error = scheduled
    ? iso
      ? validateGraphicSchedule(iso, limits)
      : "时间无效"
    : null;
  return (
    <>
      <Field data-disabled={disabled || undefined}>
        <FieldTitle id={id}>发布时间</FieldTitle>
        <ToggleGroup
          aria-labelledby={id}
          value={[scheduled ? "scheduled" : "now"]}
          multiple={false}
          variant="outline"
          size="sm"
          disabled={disabled}
          onValueChange={(values) => {
            if (values[0] === "now") {
              onChange("");
            } else if (values[0] === "scheduled") {
              // 选择定时即填入有效时间，避免启用后空值仍被作为立即发布保存。
              const minimum = getDateTimeWindow(limits, Date.now()).min!;
              onChange(formatLocalDateTime(minimum));
            }
          }}
        >
          <ToggleGroupItem value="now">立即发布</ToggleGroupItem>
          <ToggleGroupItem value="scheduled">定时发布</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {scheduled ? (
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={`${id}-picker`} className="sr-only">
            定时发布时间
          </FieldLabel>
          <DateTimePicker
            id={`${id}-picker`}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            value={value}
            disabled={disabled}
            onChange={onChange}
            {...limits}
          />
          {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
        </Field>
      ) : null}
    </>
  );
}
