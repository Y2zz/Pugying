import { useCallback } from "react";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import { PlatformResourcePicker } from "@/components/shared/PlatformResourcePicker";

/** B 站文章话题：搜索官方候选项并保存平台标识。 */
export function BilibiliTopicField({
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
      const bridge = getPugyingDesktopBridge()?.searchBilibiliTopics;
      if (!bridge) {
        return [];
      }
      return bridge(accountId, keyword);
    },
    [accountId],
  );

  return (
    <PlatformResourcePicker
      label="话题"
      value={value}
      onChange={onChange}
      search={search}
      maxCount={1}
      disabled={disabled}
      collapsedByDefault
      description="搜索并选择话题"
      placeholder="搜索话题"
      emptySummary="未添加话题"
    />
  );
}
