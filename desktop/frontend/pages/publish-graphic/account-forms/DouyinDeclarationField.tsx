import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DOUYIN_AUTHOR_DECLARATIONS,
  type DouyinAuthorDeclaration,
} from "@shared/douyin-graphic-settings";

export function DouyinDeclarationField({
  accountId,
  value = "none",
  disabled,
  onChange,
  options = DOUYIN_AUTHOR_DECLARATIONS,
}: {
  options?: readonly { value: DouyinAuthorDeclaration; label: string }[];
  accountId: string;
  value?: DouyinAuthorDeclaration;
  disabled?: boolean;
  onChange: (value: DouyinAuthorDeclaration) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = `graphic-${accountId}-declaration`;
  const current = options.find((item) => item.value === value) ?? options[0];
  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id} className="font-normal">
        自主声明
      </FieldLabel>
      <Button
        id={id}
        type="button"
        variant="outline"
        className="w-full justify-between"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        {current.label}
        <ChevronDown data-icon="inline-end" />
      </Button>
      <Dialog open={open && !disabled} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>自主声明</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldTitle id={`${id}-options`} className="sr-only">
              声明类型
            </FieldTitle>
            <ToggleGroup
              aria-labelledby={`${id}-options`}
              value={[current.value]}
              multiple={false}
              variant="outline"
              orientation="vertical"
              className="w-full"
              disabled={disabled}
              onValueChange={(values) => {
                const next = options.find((item) => item.value === values[0]);
                if (next) {
                  onChange(next.value);
                  setOpen(false);
                }
              }}
            >
              {options.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className="justify-start"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </DialogContent>
      </Dialog>
    </Field>
  );
}
