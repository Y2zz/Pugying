import type {
  ContentItem,
  ContentManagementStatus,
  ContentStatusCounts,
  ContentTargetItem,
} from "@/lib/api";
import { describePublishError } from "@/lib/publish-errors";

export const EMPTY_CONTENT_COUNTS: ContentStatusCounts = {
  all: 0,
  draft: 0,
  pending: 0,
  publishing: 0,
  needs_attention: 0,
  completed: 0,
};
export const CONTENT_STATUS_OPTIONS: Array<{
  value: ContentManagementStatus | "all";
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "pending", label: "待发布" },
  { value: "publishing", label: "发布中" },
  { value: "needs_attention", label: "需要处理" },
  { value: "completed", label: "已完成" },
];
export const PLATFORM_NAMES = {
  douyin: "抖音",
  toutiao: "今日头条",
  bilibili: "哔哩哔哩",
  xiaohongshu: "小红书",
  channels: "视频号",
};

export function summarizeContent(item: ContentItem) {
  const targets = item.targets;
  const total = targets.length;
  const succeeded = targets.filter(
    (target) => target.publishStatus === "succeeded",
  ).length;
  const failed = targets.filter(
    (target) => target.publishStatus === "failed",
  ).length;
  const cancelled = targets.filter(
    (target) => target.publishStatus === "cancelled",
  ).length;
  const running = targets.filter(
    (target) =>
      target.publishStatus === "queued" || target.publishStatus === "running",
  ).length;
  let status: ContentManagementStatus;
  let label: string;
  if (running > 0) {
    status = "publishing";
    label = "发布中";
  } else if (failed > 0 || cancelled > 0) {
    status = "needs_attention";
    label = "需要处理";
  } else if (total > 0 && succeeded === total) {
    status = "completed";
    label = "全部完成";
  } else if (succeeded > 0) {
    status = "pending";
    label = "部分完成";
  } else {
    status = item.status === "draft" ? "draft" : "pending";
    label = status === "draft" ? "草稿" : "待发布";
  }
  const parts = [
    status === "draft"
      ? `已选 ${total} 个账号`
      : `成功 ${succeeded} / 共 ${total} 个账号`,
  ];
  if (failed > 0) {
    parts.push(`${failed} 失败`);
  }
  if (cancelled > 0) {
    parts.push(`${cancelled} 已取消`);
  }
  if (running > 0) {
    parts.push(`${running} 进行中`);
  }
  const tone =
    status === "needs_attention"
      ? "destructive"
      : status === "completed"
        ? "default"
        : status === "publishing"
          ? "secondary"
          : "outline";
  return {
    status,
    label,
    tone: tone as "destructive" | "default" | "secondary" | "outline",
    total,
    succeeded,
    failed,
    cancelled,
    running,
    line: parts.join(" · "),
  };
}

export function contentTargetMessage(target: Pick<ContentTargetItem, 'publishStatus' | 'errorCode' | 'errorMessage'>): string {
  if (target.publishStatus === "cancelled") {
    return "发布已取消，可重新发布";
  }
  switch (target.errorCode) {
    case "AUTH_EXPIRED":
      return "登录已失效，请重新授权后重试";
    case "MEDIA_MISSING":
    case "MEDIA_UNREACHABLE":
      return "找不到素材，请重新选择文件";
    case "ADAPTER_PARTIAL":
    case "ADAPTER_UI_CHANGED":
      return "未能自动完成，请在打开的窗口里确认发布结果";
    case "unsupported_platform":
      return "该平台暂未开放自动发布";
    case "ARTICLE_API_CHANGED":
    case "ARTICLE_IMAGE_UNSUPPORTED":
    case "ARTICLE_FORMAT_UNSUPPORTED":
    case "ARTICLE_SETTINGS_UNSUPPORTED":
    case "ARTICLE_SETTINGS_UNAVAILABLE":
    case "ARTICLE_PUBLISH_LIMIT_REACHED":
    case "PLATFORM_VERIFICATION_REQUIRED":
    case "PLATFORM_REJECTED":
    case "PUBLISH_RESULT_UNKNOWN":
    case "HTTP_REQUEST_FAILED":
    case "HTTP_TIMEOUT":
    case "invalid_payload":
      return describePublishError(target.errorCode, target.errorMessage);
    default:
      return "发布未成功，请稍后重试";
  }
}

export function safePlatformUrl(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
