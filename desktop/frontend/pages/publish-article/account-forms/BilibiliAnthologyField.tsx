import { useCallback } from "react";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import { PlatformResourcePicker } from "@/components/shared/PlatformResourcePicker";

/** B 站文章文集：从当前账号文集列表选择并保存平台标识。 */
export function BilibiliAnthologyField({
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
      const bridge = getPugyingDesktopBridge()?.searchBilibiliAnthologies;
      if (!bridge) {
        return [];
      }
      return bridge(accountId, keyword);
    },
    [accountId],
  );

  return (
    <PlatformResourcePicker
      label="文集"
      value={value}
      onChange={onChange}
      search={search}
      maxCount={1}
      disabled={disabled}
      collapsedByDefault
      browseOnEmpty
      description="从当前账号的文集中选择"
      placeholder="搜索文集"
      emptySummary="未加入文集"
    />
  );
}
