import { useEffect, useId, useMemo, useState } from "react";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";

/** 头条文章位置：常驻城市 Combobox；账号侧一次拉列表，输入仅本地过滤。 */
export function ToutiaoLocationField({
  accountId,
  value,
  disabled,
  onChange,
}: {
  accountId: string;
  value: PlatformResourceRef[];
  disabled?: boolean;
  onChange: (next: PlatformResourceRef[]) => void;
}) {
  const id = useId();
  const selected = value[0] ?? null;
  const [cities, setCities] = useState<PlatformResourceRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setCities([]);
    void (async () => {
      try {
        const bridge = getPugyingDesktopBridge()?.searchToutiaoLocations;
        if (!bridge) {
          throw new Error("bridge_unavailable");
        }
        // 空关键词返回全量城市；主进程按账号去重并发，此处按挂载拉一次
        const items = await bridge(accountId, "");
        if (!active) {
          return;
        }
        setCities(items);
        setLoading(false);
      } catch {
        if (!active) {
          return;
        }
        setCities([]);
        setFailed(true);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accountId]);

  // 草稿已选城市可能暂不在刚加载的列表里，合并进 items 以便 Combobox 回显
  const items = useMemo(() => {
    if (!selected) {
      return cities;
    }
    if (cities.some((city) => city.id === selected.id)) {
      return cities;
    }
    return [selected, ...cities];
  }, [cities, selected]);

  const unavailable = Boolean(disabled) || loading || failed;
  const hint = loading
    ? "正在加载…"
    : failed
      ? "暂时无法加载，请稍后重试"
      : "从列表中选择发布城市";

  return (
    <Field data-disabled={unavailable || undefined} className="gap-2">
      <FieldLabel htmlFor={id} className="font-normal">
        位置
      </FieldLabel>
      <Combobox
        items={items}
        value={selected}
        onValueChange={(next) => {
          onChange(next ? [next] : []);
        }}
        itemToStringLabel={(item) => item.name}
        itemToStringValue={(item) => item.id}
        isItemEqualToValue={(a, b) => a.id === b.id}
        disabled={unavailable}
      >
        <ComboboxInput
          id={id}
          className="w-full"
          placeholder="选择城市"
          disabled={unavailable}
          showClear={Boolean(selected) && !unavailable}
        />
        <ComboboxContent className="w-(--anchor-width)">
          <ComboboxEmpty>没有匹配的城市</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.id} value={item}>
                {item.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  );
}
