import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/** 与平台表单一致的互斥单选，保留标准标签与键盘操作。 */
export function ArticleRadioField({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FieldSet data-disabled={disabled || undefined}>
      <FieldLegend variant="label" id={`${id}-label`} className="font-normal">
        {label}
      </FieldLegend>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === 'string' && options.some((item) => item.value === next)) {
            onChange(next);
          }
        }}
      >
        <FieldGroup className="flex-row flex-wrap gap-x-6 gap-y-3">
          {options.map((item) => (
            <Field
              key={item.value}
              orientation="horizontal"
              className="w-auto max-w-full"
              data-disabled={disabled || undefined}
            >
              <RadioGroupItem id={`${id}-${item.value}`} value={item.value} disabled={disabled} />
              <FieldLabel htmlFor={`${id}-${item.value}`} className="font-normal">{item.label}</FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </RadioGroup>
    </FieldSet>
  );
}
