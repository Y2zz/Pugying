import { useCallback } from "react";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import { PlatformResourcePicker } from "@/components/shared/PlatformResourcePicker";

/** 抖音视频位置：搜索官方 POI 并保存平台标识。 */
export function DouyinLocationField({
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
      const bridge = getPugyingDesktopBridge()?.searchDouyinLocations;
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
      description="搜索并选择发布位置"
      placeholder="搜索位置"
      emptySummary="未添加位置"
    />
  );
}
