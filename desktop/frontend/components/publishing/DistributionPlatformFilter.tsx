import { useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { DistributionFilterTrigger } from "@/components/publishing/DistributionFilterTrigger";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Button } from "@/components/ui/button";
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
import type { PlatformId } from "@/lib/api";
import { PLATFORM_NAMES } from "@/lib/content-management";

/** 平台多选，规则与账号筛选一致。 */
export function DistributionPlatformFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const selected = new Set(value);
  const toggle = (id: string) =>
    onChange(
      selected.has(id) ? value.filter((item) => item !== id) : [...value, id],
    );
  const selection =
    value.length === 0
      ? null
      : value.length === 1
        ? (PLATFORM_NAMES[value[0] as PlatformId] ?? value[0])
        : String(value.length);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <DistributionFilterTrigger
        name="平台"
        anchorRef={anchorRef}
        icon={<ListFilter />}
        selection={selection}
        onClear={() => onChange([])}
        renderTrigger={(button, label) => (
          <PopoverTrigger render={button}>{label}</PopoverTrigger>
        )}
      />
      <PopoverContent anchor={anchorRef} align="end" className="w-56 p-0">
        <Command>
          <CommandList className="max-h-72">
            <CommandGroup>
              {(Object.keys(PLATFORM_NAMES) as PlatformId[]).map((id) => (
                <CommandItem
                  key={id}
                  value={id}
                  keywords={[PLATFORM_NAMES[id]]}
                  data-checked={selected.has(id)}
                  onSelect={() => toggle(id)}
                >
                  <PlatformIcon platform={id} alt="" className="size-4" />
                  {PLATFORM_NAMES[id]}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {value.length > 0 ? (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onChange([])}
              >
                清除已选平台
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
