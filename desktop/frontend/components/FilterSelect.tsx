import { useRef, useState, type ReactNode } from "react";
import { DistributionFilterTrigger } from "@/components/publishing/DistributionFilterTrigger";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface FilterSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

/**
 * 工具栏单选筛选，外观与分发队列的平台/账号筛选一致：
 * 定宽按钮、选中后主色填充、内嵌 ✕ 清除、鼠标操作后不显示焦点框。
 * value 为空字符串表示未筛选。
 */
export function FilterSelect({
  name,
  icon,
  options,
  value,
  onChange,
  triggerClassName,
}: {
  name: string;
  icon: ReactNode;
  options: FilterSelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** 覆盖默认定宽，用于最长选项放不下 w-36 的筛选 */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <DistributionFilterTrigger
        name={name}
        anchorRef={anchorRef}
        icon={icon}
        selection={selected ? selected.label : null}
        className={triggerClassName}
        onClear={() => onChange("")}
        renderTrigger={(button, label) => (
          <PopoverTrigger render={button}>{label}</PopoverTrigger>
        )}
      />
      <PopoverContent anchor={anchorRef} align="end" className="w-48 p-0">
        <Command>
          <CommandList className="max-h-72">
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  data-checked={option.value === value}
                  onSelect={() => {
                    onChange(option.value === value ? "" : option.value);
                    setOpen(false);
                  }}
                >
                  {option.icon}
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
