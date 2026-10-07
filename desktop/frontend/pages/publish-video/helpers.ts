import {
  composeDouyinGraphicDescription,
  type DouyinAuthorDeclaration,
} from "@shared/douyin-graphic-settings";
import type {
  ContentTargetOverrides,
  ContentVisibility,
  PlatformAccountItem,
} from "@/lib/api";
import { getPugyingDesktopBridge } from "@/lib/agent-client";

export const TITLE_MAX = 30;
export const BODY_MAX = 1000;
export const MAX_VIDEO_BYTES = 32 * 1024 * 1024 * 1024;
/** 封面编辑本地上传图上限（源图不入库，仍限制避免撑爆内存） */
export const MAX_COVER_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SEC = 10 * 60 * 60;

/** 上传页及实际视频 input 接受的格式；可否本机预览还需读取视频元数据。 */
export const VIDEO_ACCEPT =
  "video/*,.flv,.avi,.wmv,.ts,.mp4,.mpeg4,.mov,.m4v,.mpg,.mkv,.m4";
export function validateVideoFile(
  file: { name: string; type: string; size: number },
  duration?: number,
  platform?: string,
): string | null {
  if (
    !file.type.startsWith("video/") &&
    !/\.(flv|avi|wmv|ts|mp4|mpeg4|mov|m4v|mpg|mkv|m4)$/i.test(file.name)
  ) {
    return "请选择视频文件";
  }
  const maxGigabytes =
    platform === "douyin" || platform === "bilibili"
      ? 16
      : platform === "xiaohongshu"
        ? 20
        : 32;
  const maxHours =
    platform === "bilibili" || !platform
      ? 10
      : platform === "douyin"
        ? 1
        : platform === "toutiao"
          ? 3
          : 4;
  if (file.size > maxGigabytes * 1024 ** 3) {
    return `视频超过 ${maxGigabytes}GB 上限`;
  }
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) {
    return "无法读取视频时长";
  }
  if (duration !== undefined && duration > maxHours * 60 * 60) {
    return `视频时长不能超过 ${maxHours} 小时`;
  }
  return null;
}

export type CoverKind = "cover" | "cover_landscape";
/** busy 细分：底栏按钮与取消处理依赖阶段，避免一律「处理中」 */
export type BusyPhase = "idle" | "uploading" | "saving" | "publishing";

/** 发布视频五步流程 id（用于推导当前阶段 UI，无步骤条） */
export type PublishFlowStepId =
  "select" | "upload" | "configure" | "publish" | "progress";

/** 由页面状态推导当前流程步（编辑加载中视为处理步） */
export function derivePublishFlowStep(input: {
  hasVideo: boolean;
  loading: boolean;
  editId: string | null;
  busyPhase: BusyPhase;
  publishHint: string;
}): PublishFlowStepId {
  const { hasVideo, loading, editId, busyPhase, publishHint } = input;

  if (busyPhase === "publishing") {
    const hint = publishHint.trim();
    if (
      hint.includes("开始推送") ||
      (hint.includes(" · ") && !hint.includes("申请"))
    ) {
      return "progress";
    }
    return "publish";
  }

  if (busyPhase === "uploading" || (editId && loading)) {
    return "upload";
  }

  if (hasVideo) {
    return "configure";
  }

  return "select";
}

export function describePublishFlowStep(step: PublishFlowStepId): string {
  switch (step) {
    case "select":
      return "请选择或拖入视频";
    case "upload":
      return "可同时填写发布信息；正在处理本机视频与封面";
    case "configure":
      return "填写发布信息并配置各账号规则";
    case "publish":
      return "正在提交发布任务";
    case "progress":
      return "正在发布";
    default:
      return "";
  }
}

export const VISIBILITY_OPTIONS: { value: ContentVisibility; label: string }[] =
  [
    { value: "public", label: "公开" },
    { value: "friends", label: "好友可见" },
    { value: "private", label: "仅自己可见" },
  ];

export const ACCOUNT_STATUS_TEXT: Record<
  PlatformAccountItem["status"],
  string
> = {
  active: "正常",
  expired: "已过期",
  revoked: "已失效",
};

/** 可选覆盖通用文案的字段（留空则继承通用设置；封面走独立 BLOB，不在 overrides） */
export const OPTIONAL_OVERRIDE_LABELS: [
  keyof ContentTargetOverrides,
  string,
][] = [
  ["title", "标题"],
  ["body", "描述"],
];

export interface OverrideDraft {
  /** 留空继承通用标题 */
  title: string;
  /** 留空继承通用描述 */
  body: string;
  /** 待上传的账号竖封面（保存时带 targetId 上传） */
  coverBlob: Blob | null;
  /** 待上传的账号横封面 */
  coverLandscapeBlob: Blob | null;
  /** 会话内竖封面预览（blob: 或已拉到的 object URL） */
  coverPreviewUrl: string;
  /** 会话内横封面预览 */
  coverLandscapePreviewUrl: string;
  /** 服务端该账号已有竖封面差异 */
  hasCover: boolean;
  /** 服务端该账号已有横封面差异 */
  hasCoverLandscape: boolean;
  /** 会话内竖封面源图（供再次编辑；不入库） */
  coverSourceUrl: string;
  /** 会话内横封面源图（供再次编辑；不入库） */
  coverLandscapeSourceUrl: string;
  /** 竖封面源图对应视频时刻（会话内；上传则为 null） */
  coverSourceFrameTime: number | null;
  /** 横封面源图对应视频时刻（会话内；上传则为 null） */
  coverLandscapeSourceFrameTime: number | null;
  /** 该账号独立发布选项（非通用） */
  tagsText: string;
  scheduledLocal: string;
  visibility: ContentVisibility;
  allowDownload: boolean;
  authorDeclaration?: DouyinAuthorDeclaration;
  bilibiliVideoSettings?: import("@shared/bilibili-video-settings").BilibiliVideoSettings;
  /** 地点（图文：小红书等） */
  location: string;
  /** 分区文案（图文：哔哩哔哩等） */
  partition: string;
}

export function emptyDraft(): OverrideDraft {
  return {
    title: "",
    body: "",
    coverBlob: null,
    coverLandscapeBlob: null,
    coverPreviewUrl: "",
    coverLandscapePreviewUrl: "",
    hasCover: false,
    hasCoverLandscape: false,
    coverSourceUrl: "",
    coverLandscapeSourceUrl: "",
    coverSourceFrameTime: null,
    coverLandscapeSourceFrameTime: null,
    tagsText: "",
    scheduledLocal: "",
    visibility: "public",
    allowDownload: true,
    authorDeclaration: "none",
    location: "",
    partition: "",
  };
}

/** ISO → 日期时间选择器使用的本地时间字符串 */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(value: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** 抖音定时规则：2 小时后至 14 天内 */
export function validateSchedule(
  iso: string,
  platform = "douyin",
): string | null {
  const time = new Date(iso).getTime();
  const now = Date.now();
  if (!Number.isFinite(time)) {
    return "请选择有效的发布时间";
  }
  if (platform === "toutiao" || platform === "bilibili") {
    return time <= now ? "请选择未来的发布时间" : null;
  }
  if (time < now + (platform === "xiaohongshu" ? 1 : 2) * 60 * 60 * 1000) {
    return platform === "xiaohongshu"
      ? "定时发布需至少在 1 小时之后"
      : "定时发布需至少在 2 小时之后";
  }
  if (time > now + 14 * 24 * 60 * 60 * 1000) {
    return "定时发布不能超过 14 天（参考抖音规则）";
  }
  return null;
}

export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,，#]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

/** 统计可选覆盖项（标题/描述/账号封面）已填数量，用于账号卡片 Badge */
export function optionalOverrideCount(draft: OverrideDraft): number {
  let count = 0;
  if (draft.title.trim()) {
    count += 1;
  }
  if (draft.body.trim()) {
    count += 1;
  }
  if (draft.coverBlob || draft.hasCover || draft.coverPreviewUrl.trim()) {
    count += 1;
  }
  if (
    draft.coverLandscapeBlob ||
    draft.hasCoverLandscape ||
    draft.coverLandscapePreviewUrl.trim()
  ) {
    count += 1;
  }
  return count;
}

export function overridesToDraft(
  o: ContentTargetOverrides | undefined,
): OverrideDraft {
  return {
    title: o?.title ?? "",
    body: o?.body ?? "",
    coverBlob: null,
    coverLandscapeBlob: null,
    coverPreviewUrl: "",
    coverLandscapePreviewUrl: "",
    hasCover: false,
    hasCoverLandscape: false,
    coverSourceUrl: "",
    coverLandscapeSourceUrl: "",
    coverSourceFrameTime: null,
    coverLandscapeSourceFrameTime: null,
    tagsText: o?.tags?.join(" ") ?? "",
    scheduledLocal: isoToLocalInput(o?.scheduledAt),
    visibility: o?.visibility ?? "public",
    allowDownload: o?.allowDownload ?? true,
    authorDeclaration: o?.authorDeclaration ?? "none",
    bilibiliVideoSettings: o?.bilibiliVideoSettings,
    location: o?.location ?? "",
    partition: o?.partition ?? "",
  };
}

/**
 * 编辑回显：target overrides 优先；旧数据可能仅存于 content 级字段，按账号回填。
 */
export function draftFromTargetAndContent(
  overrides: ContentTargetOverrides | undefined,
  content: {
    tags: string[];
    visibility: ContentVisibility;
    scheduledAt: string | null;
    allowDownload: boolean;
    location?: string | null;
  },
): OverrideDraft {
  const draft = overridesToDraft(overrides);
  return {
    ...draft,
    tagsText: draft.tagsText || content.tags.join(" "),
    scheduledLocal:
      draft.scheduledLocal || isoToLocalInput(content.scheduledAt),
    visibility: overrides?.visibility ?? content.visibility,
    allowDownload: overrides?.allowDownload ?? content.allowDownload,
    location: draft.location || (content.location ?? "").trim(),
  };
}

export function draftToOverrides(draft: OverrideDraft): ContentTargetOverrides {
  const result: ContentTargetOverrides = {};
  if (draft.title.trim()) {
    result.title = draft.title.trim();
  }
  if (draft.body.trim()) {
    result.body = draft.body.trim();
  }
  const tags = parseTags(draft.tagsText);
  if (tags.length > 0) {
    result.tags = tags;
  }
  const iso = localInputToIso(draft.scheduledLocal);
  if (iso) {
    result.scheduledAt = iso;
  }
  result.visibility = draft.visibility;
  result.allowDownload = draft.allowDownload;
  result.authorDeclaration = draft.authorDeclaration ?? "none";
  if (draft.bilibiliVideoSettings) {
    result.bilibiliVideoSettings = { ...draft.bilibiliVideoSettings };
  }
  if (draft.location.trim()) {
    result.location = draft.location.trim();
  }
  if (draft.partition.trim()) {
    result.partition = draft.partition.trim();
  }
  return result;
}

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 本机路径 → file://，供会话内 video 预览（不经媒体库） */
export function localPathToFileUrl(absPath: string): string {
  const trimmed = absPath.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("file:")) {
    return trimmed;
  }
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return `file:///${trimmed.replace(/\\/g, "/")}`;
  }
  return `file://${trimmed}`;
}

/** 外置盘 / 网盘同步目录上的路径发布时易失效，选片后提示用户 */
export function looksUnstableLocalPath(absPath: string): boolean {
  const p = absPath.toLowerCase();
  return (
    p.includes("/volumes/") ||
    p.includes("\\volumes\\") ||
    p.includes("icloud") ||
    p.includes("mobile documents") ||
    p.includes("com~apple~clouddocs") ||
    p.includes("onedrive") ||
    p.includes("baidu") ||
    p.includes("百度网盘")
  );
}

export const LOCAL_PATH_MISSING_VIDEO = "源文件不可用，请重新选择视频";
export const LOCAL_PATH_MISSING_IMAGE = "源文件不可用，请重新选择图片";

/** 经 preload IPC 校验本机路径是否可读；无桥接时视为未知（返回 true，避免浏览器开发态误报） */
export async function checkLocalPathReadable(
  absPath: string,
): Promise<boolean> {
  const trimmed = absPath.trim();
  if (!trimmed) {
    return false;
  }
  const bridge = getPugyingDesktopBridge();
  if (!bridge?.checkLocalPathReadable) {
    return true;
  }
  try {
    return await bridge.checkLocalPathReadable(trimmed);
  } catch {
    return false;
  }
}

/** 批量校验；全部可读才为 true */
export async function checkLocalPathsReadable(
  paths: string[],
): Promise<boolean> {
  for (const p of paths) {
    if (!(await checkLocalPathReadable(p))) {
      return false;
    }
  }
  return true;
}

/** 视频处理子阶段：生成本地预览 / 截封面 */
export type VideoUploadPhase = "video" | "cover";

export type VideoUploadMetrics = {
  phase: VideoUploadPhase;
  loadedBytes: number;
  totalBytes: number;
  /** 0–1；封面阶段为 null（ indeterminate ） */
  ratio: number | null;
  speedBps: number;
};

/** 格式化上传速度（抖音创作者中心类似展示） */
export function formatTransferRate(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) {
    return "--";
  }
  if (bps < 1024 * 1024) {
    return `${(bps / 1024).toFixed(1)} KB/s`;
  }
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

/** 根据剩余字节与当前速度估算剩余时间 */
export function formatRemainingTime(
  remainingBytes: number,
  speedBps: number,
): string | null {
  if (!Number.isFinite(speedBps) || speedBps <= 0 || remainingBytes <= 0) {
    return null;
  }
  const sec = Math.ceil(remainingBytes / speedBps);
  if (sec < 60) {
    return `剩余时间：${sec}秒`;
  }
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (rest === 0) {
    return `剩余时间：${min}分钟`;
  }
  return `剩余时间：${min}分${rest}秒`;
}

/** 滑动平均上传速度采样，避免分片边界导致瞬时速度跳动 */
export function createUploadSpeedTracker() {
  let lastBytes = 0;
  let lastTime = 0;
  let speedBps = 0;

  return {
    reset() {
      lastBytes = 0;
      lastTime = 0;
      speedBps = 0;
    },
    sample(loadedBytes: number): number {
      const now = performance.now();
      if (lastTime > 0 && loadedBytes > lastBytes) {
        const deltaMs = now - lastTime;
        if (deltaMs >= 80) {
          const instant = (loadedBytes - lastBytes) / (deltaMs / 1000);
          speedBps = speedBps > 0 ? speedBps * 0.65 + instant * 0.35 : instant;
          lastBytes = loadedBytes;
          lastTime = now;
        }
      } else if (lastTime === 0) {
        lastBytes = loadedBytes;
        lastTime = now;
      }
      return speedBps;
    },
  };
}

const UPLOAD_PHASE_LABELS: Record<VideoUploadPhase, string> = {
  video: "正在读取视频",
  cover: "正在生成封面",
};

export function describeVideoUploadPhase(phase: VideoUploadPhase): string {
  return UPLOAD_PHASE_LABELS[phase];
}

/** 右栏 9:16 手机柱 UI 阶段（单柱状态机，对齐抖音创作者中心） */
export type VideoPhonePhase = "idle" | "processing" | "ready";

export function deriveVideoPhonePhase(input: {
  hasVideo: boolean;
  videoPreviewUrl: string | null;
  uploading: boolean;
}): VideoPhonePhase {
  if (input.hasVideo && input.videoPreviewUrl && !input.uploading) {
    return "ready";
  }
  if (input.uploading) {
    return "processing";
  }
  if (input.hasVideo && input.videoPreviewUrl) {
    return "ready";
  }
  return "idle";
}

/** 列表行一行摘要：可见性 · 定时 · 话题 */
export function describeAccountPublishSummary(draft: OverrideDraft): string {
  const visibility =
    VISIBILITY_OPTIONS.find((opt) => opt.value === draft.visibility)?.label ??
    "公开";
  const schedule = draft.scheduledLocal.trim()
    ? formatScheduleSummary(draft.scheduledLocal)
    : "立即发布";
  const tags = parseTags(draft.tagsText);
  const tagPart = tags.length > 0 ? ` · ${tags.length} 个话题` : "";
  return `${visibility} · ${schedule}${tagPart}`;
}

function formatScheduleSummary(local: string): string {
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) {
    return "定时待完善";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `定时 ${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 账号发布配置问题（用于列表行警告） */
export function getAccountDraftIssues(
  draft: OverrideDraft,
  commonBody = "",
  platform = "douyin",
  commonTitle = "",
): string[] {
  const issues: string[] = [];
  if (platform === "bilibili") {
    const settings = draft.bilibiliVideoSettings;
    if (!settings?.partitionId) {
      issues.push("请选择视频分区");
    }
    if (settings?.copyright === 2 && !settings.source?.trim()) {
      issues.push("请填写转载来源");
    }
    const tags = parseTags(draft.tagsText);
    if (
      !tags.length ||
      tags.length > 10 ||
      tags.some((tag) => tag.includes(","))
    ) {
      issues.push("请添加 1 至 10 个标签");
    }
    if (!["public", "private"].includes(draft.visibility)) {
      issues.push("请重新选择可见范围");
    }
  }
  if (draft.scheduledLocal.trim()) {
    const iso = localInputToIso(draft.scheduledLocal);
    if (!iso) {
      issues.push("定时无效");
    } else {
      const scheduleError = validateSchedule(iso, platform);
      if (scheduleError) {
        issues.push("定时超出范围");
      }
    }
  }
  if (
    (draft.title.trim() || commonTitle).length >
    (platform === "xiaohongshu" ? 20 : TITLE_MAX)
  ) {
    issues.push("标题超长");
  }
  if (
    (platform === "bilibili"
      ? (draft.body.trim() || commonBody).length
      : composeDouyinGraphicDescription(
          draft.body.trim() || commonBody,
          parseTags(draft.tagsText),
        ).length) > BODY_MAX
  ) {
    issues.push("简介与话题合计超过 1000 字");
  }
  if (platform === "xiaohongshu" || platform === "toutiao") {
    if (!["public", "private"].includes(draft.visibility)) {
      issues.push("请重新选择可见范围");
    }
    if (parseTags(draft.tagsText).length) {
      issues.push("请将话题写入简介");
    }
    if (
      (platform === "xiaohongshu" &&
        draft.authorDeclaration === "personal_opinion") ||
      (platform === "toutiao" && draft.authorDeclaration === "marketing")
    ) {
      issues.push("请重新选择自主声明");
    }
  }
  return issues;
}

/** 统计已选活跃账号的配置问题，供底栏 checklist 与 focus 使用 */
export function summarizeSelectedAccountIssues(
  entries: { account: PlatformAccountItem; draft: OverrideDraft }[],
  commonBody = "",
  commonTitle = "",
): { issueCount: number; firstIssueAccountId: string | null } {
  let issueCount = 0;
  let firstIssueAccountId: string | null = null;
  for (const { account, draft } of entries) {
    if (account.status !== "active") {
      continue;
    }
    const issues = getAccountDraftIssues(
      draft,
      commonBody,
      account.platform,
      commonTitle,
    );
    if (issues.length > 0) {
      issueCount += issues.length;
      if (!firstIssueAccountId) {
        firstIssueAccountId = account.id;
      }
    }
  }
  return { issueCount, firstIssueAccountId };
}

/** 截断展示通用默认值（覆盖区对照用） */
export function truncateCommonReference(text: string, max = 48): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}
