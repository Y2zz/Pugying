import { useCallback } from "react";
import type { PlatformResourceRef } from "@shared/platform-resource";
import { getPugyingDesktopBridge } from "@/lib/agent-client";
import { PlatformResourcePicker } from "@/components/shared/PlatformResourcePicker";

/** 抖音文章话题：搜索官方候选项并保存平台标识。 */
export function DouyinTopicField({
  accountId,
  value,
  maxCount,
  disabled,
  validationMessage,
  onChange,
}: {
  accountId: string;
  value: PlatformResourceRef[];
  maxCount: number;
  disabled?: boolean;
  validationMessage?: string;
  onChange: (next: PlatformResourceRef[]) => void;
}) {
  const search = useCallback(
    async (keyword: string) => {
      const bridge = getPugyingDesktopBridge()?.searchDouyinTopics;
      if (!bridge) {
        return [];
      }
      return bridge(accountId, keyword);
    },
    [accountId],
  );
  const over = value.length > maxCount;
  const error = over
    ? `最多 ${maxCount} 个话题，请删除 ${value.length - maxCount} 个`
    : validationMessage;

  return (
    <PlatformResourcePicker
      label="话题"
      value={value}
      onChange={onChange}
      search={search}
      maxCount={maxCount}
      disabled={disabled}
      invalid={Boolean(error)}
      error={error}
      description={`从搜索结果中选择，最多 ${maxCount} 个`}
      placeholder="搜索话题"
    />
  );
}
