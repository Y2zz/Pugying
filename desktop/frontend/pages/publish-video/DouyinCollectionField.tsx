import { useCallback } from "react";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import { PlatformResourcePicker } from "@/components/shared/PlatformResourcePicker";

/** 抖音视频合集：从当前账号合集列表选择并保存平台标识。 */
export function DouyinCollectionField({
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
      const bridge = getPugyingDesktopBridge()?.searchDouyinCollections;
      if (!bridge) {
        return [];
      }
      return bridge(accountId, keyword);
    },
    [accountId],
  );

  return (
    <PlatformResourcePicker
      label="合集"
      value={value}
      onChange={onChange}
      search={search}
      maxCount={1}
      disabled={disabled}
      collapsedByDefault
      browseOnEmpty
      description="从当前账号的合集中选择"
      placeholder="搜索合集"
      emptySummary="未加入合集"
    />
  );
}
