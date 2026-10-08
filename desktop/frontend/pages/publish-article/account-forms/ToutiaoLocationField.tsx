import { useCallback } from "react";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import { PlatformResourcePicker } from "@/components/shared/PlatformResourcePicker";

/** 头条文章位置：从账号城市列表选择并保存平台城市编码。 */
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
  const search = useCallback(
    async (keyword: string) => {
      const bridge = getPugyingDesktopBridge()?.searchToutiaoLocations;
      if (!bridge) {
        return [];
      }
      return bridge(accountId, keyword);
    },
    [accountId],
  );

  return (
    <PlatformResourcePicker
      label="位置"
      value={value}
      onChange={onChange}
      search={search}
      maxCount={1}
      disabled={disabled}
      collapsedByDefault
      browseOnEmpty
      description="搜索并选择发布城市"
      placeholder="搜索城市"
      emptySummary="未添加位置"
    />
  );
}
