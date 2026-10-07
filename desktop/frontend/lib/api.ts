/** 可由桌面 preload 在启动时覆盖为实际本机 Nest 端口 */
import { getPugyingDesktopBridge } from "@/lib/agent-client";

let apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://127.0.0.1:3928";
let localApiToken = "";

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

/** 桌面端启动后注入本机 Server 基址 */
export function setApiBaseUrl(url: string): void {
  const trimmed = url.trim().replace(/\/$/, "");
  if (trimmed) {
    apiBaseUrl = trimmed;
  }
}

export function setLocalApiToken(token: string): void {
  localApiToken = token.trim();
}

export interface ProductVersionInfo {
  version: string;
  minAgentVersion: string;
}

/** 统一发版产品版本（公开接口，无需登录） */
export async function fetchProductVersion(): Promise<ProductVersionInfo> {
  return apiFetch<ProductVersionInfo>("/version");
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!headers.has("Content-Type") && init.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (localApiToken) {
    headers.set("X-Pugying-Local-Token", localApiToken);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) {
        message = body.message.join(", ");
      } else if (body.message) {
        message = body.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  // Nest 的 void DELETE 常为 200 + 空 body；仅认 204 会误走 json() 抛 Unexpected end of JSON input
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export type PlatformId =
  "douyin" | "toutiao" | "channels" | "bilibili" | "xiaohongshu";

export interface PlatformCatalogItem {
  id: PlatformId;
  displayName: string;
  loginUrl: string;
}

export interface PlatformAccountItem {
  id: string;
  platform: PlatformId;
  displayName: string;
  platformUserId: string | null;
  /** Platform nickname is refreshed independently of the local display name. */
  platformNickname?: string | null;
  avatarUrl: string | null;
  status: "active" | "expired" | "revoked";
  lastAuthedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Best-effort profile scraped by the Agent; every field may be missing. */
export interface PlatformProfile {
  platformUserId?: string;
  nickname?: string;
  avatarUrl?: string;
}

export async function fetchPlatformCatalog(): Promise<PlatformCatalogItem[]> {
  return apiFetch<PlatformCatalogItem[]>("/platform-accounts/platforms");
}

export async function fetchPlatformAccounts(params?: {
  platform?: PlatformId;
}): Promise<PlatformAccountItem[]> {
  const query = params?.platform
    ? `?platform=${encodeURIComponent(params.platform)}`
    : "";
  return apiFetch<PlatformAccountItem[]>(`/platform-accounts${query}`);
}

export async function bindPlatformAccount(body: {
  platform: string;
  displayName?: string;
  platformUserId?: string;
  cookies: unknown[];
  finalUrl?: string;
  profile?: PlatformProfile;
}): Promise<PlatformAccountItem> {
  return apiFetch<PlatformAccountItem>("/platform-accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function reauthPlatformAccount(
  id: string,
  body: {
    cookies: unknown[];
    displayName?: string;
    platformUserId?: string;
    finalUrl?: string;
    profile?: PlatformProfile;
  },
): Promise<PlatformAccountItem> {
  return apiFetch<PlatformAccountItem>(`/platform-accounts/${id}/reauth`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Manual rename — fallback when the Agent couldn't scrape a nickname. */
export async function renamePlatformAccount(
  id: string,
  displayName: string,
): Promise<PlatformAccountItem> {
  return apiFetch<PlatformAccountItem>(`/platform-accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
}

export async function deletePlatformAccount(id: string): Promise<void> {
  await apiFetch<void>(`/platform-accounts/${id}`, {
    method: "DELETE",
  });
}

export interface PlatformAccountCredentials {
  accountId: string;
  platform: PlatformId;
  displayName: string;
  /** Creator-center entry URL for this platform */
  openUrl: string;
  cookies: unknown[];
  finalUrl: string | null;
}

/** Decrypted cookies for the desktop Agent to open a creator-center window. */
export async function fetchPlatformAccountCredentials(
  id: string,
): Promise<PlatformAccountCredentials> {
  return apiFetch<PlatformAccountCredentials>(
    `/platform-accounts/${id}/credentials`,
    { method: "POST" },
  );
}

export type ContentType = "article" | "graphic" | "video";
export type ContentStatus = "draft" | "published";
export type ContentVisibility = "public" | "friends" | "private";
export type TargetPublishStatus =
  "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** 针对单个平台账号的差异字段；封面差异走独立 BLOB 接口 */
export interface ContentTargetOverrides {
  title?: string;
  body?: string;
  tags?: string[];
  scheduledAt?: string;
  visibility?: ContentVisibility;
  allowDownload?: boolean;
  articleSettings?: import("@shared/article-settings").ArticleAccountSettings;
  bilibiliVideoSettings?: import("@shared/bilibili-video-settings").BilibiliVideoSettings;
  authorDeclaration?: import("@shared/douyin-graphic-settings").DouyinAuthorDeclaration;
  /** 地点（如小红书笔记） */
  location?: string;
  /** 分区等扩展文案（如哔哩哔哩） */
  partition?: string;
}

export interface ContentTargetItem {
  id: string;
  contentId: string;
  platformAccountId: string;
  platform: PlatformId;
  overrides: ContentTargetOverrides;
  hasCover: boolean;
  hasCoverLandscape: boolean;
  hasCoverLandscape2?: boolean;
  hasCoverLandscape3?: boolean;
  publishStatus: TargetPublishStatus;
  platformPostId: string | null;
  platformUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  body: string | null;
  hasCover: boolean;
  hasCoverLandscape: boolean;
  mediaPaths: string[];
  status: ContentStatus;
  publishedAt: string | null;
  tags: string[];
  location: string | null;
  visibility: ContentVisibility;
  scheduledAt: string | null;
  allowDownload: boolean;
  targets: ContentTargetItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentTargetInput {
  platformAccountId: string;
  overrides?: ContentTargetOverrides;
}

export interface CreateContentBody {
  type: ContentType;
  title: string;
  body?: string;
  mediaPaths?: string[];
  status?: ContentStatus;
  tags?: string[];
  location?: string;
  visibility?: ContentVisibility;
  scheduledAt?: string;
  allowDownload?: boolean;
  targets?: ContentTargetInput[];
}

export type UpdateContentBody = Partial<Omit<CreateContentBody, "type">>;

export interface PublishCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface PublishDispatch {
  targetId: string;
  platform: string;
  accountId: string;
  contentType: "video" | "article" | "graphic";
  mediaPath: string;
  mediaPaths: string[];
  coverPath: string;
  coverLandscapePath: string;
  articleCoverPaths?: string[];
  title: string;
  body?: string;
  tags?: string[];
  articleSettings?: import("@shared/article-settings").ArticleAccountSettings;
  bilibiliVideoSettings?: import("@shared/bilibili-video-settings").BilibiliVideoSettings;
  authorDeclaration?: import("@shared/douyin-graphic-settings").DouyinAuthorDeclaration;
  visibility: string;
  scheduledAt?: string;
  allowDownload: boolean;
  cookies: PublishCookie[];
}

export interface PublishStartResult {
  content: ContentItem;
  dispatches: PublishDispatch[];
}

export type ContentManagementStatus =
  "draft" | "pending" | "publishing" | "needs_attention" | "completed";
export type ContentStatusCounts = Record<
  ContentManagementStatus | "all",
  number
>;

export interface ContentListResult {
  counts: ContentStatusCounts;
  items: ContentItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchContents(params?: {
  managementStatus?: ContentManagementStatus;
  type?: ContentType;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<ContentListResult> {
  const search = new URLSearchParams();
  if (params?.managementStatus) {
    search.set("managementStatus", params.managementStatus);
  }
  if (params?.type) {
    search.set("type", params.type);
  }
  const q = params?.q?.trim();
  if (q) {
    search.set("q", q);
  }
  if (params?.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params?.pageSize !== undefined) {
    search.set("pageSize", String(params.pageSize));
  }
  const query = search.toString();
  return apiFetch<ContentListResult>(`/contents${query ? `?${query}` : ""}`);
}

export async function fetchContent(id: string): Promise<ContentItem> {
  return apiFetch<ContentItem>(`/contents/${id}`);
}

export async function fetchDistributionPage(
  view: import("@shared/distribution").DistributionView = "active",
  page = 1,
): Promise<import("@shared/distribution").DistributionPage> {
  return apiFetch(
    `/contents/distribution?view=${view}&page=${page}&pageSize=20`,
    { signal: AbortSignal.timeout(10000) },
  );
}

export async function createContent(
  body: CreateContentBody,
): Promise<ContentItem> {
  return apiFetch<ContentItem>("/contents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateContent(
  id: string,
  body: UpdateContentBody,
): Promise<ContentItem> {
  return apiFetch<ContentItem>(`/contents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteContent(id: string): Promise<void> {
  await apiFetch<void>(`/contents/${id}`, {
    method: "DELETE",
  });
}

export async function publishContent(id: string): Promise<PublishStartResult> {
  return apiFetch<PublishStartResult>(`/contents/${id}/publish`, {
    method: "POST",
  });
}

export async function startContentTarget(
  contentId: string,
  targetId: string,
): Promise<{ target: ContentTargetItem; dispatch: PublishDispatch }> {
  return apiFetch(`/contents/${contentId}/targets/${targetId}/start`, {
    method: "POST",
  });
}

export async function completeContentTarget(
  contentId: string,
  targetId: string,
  body: {
    ok: boolean;
    errorCode?: string;
    errorMessage?: string;
    platformPostId?: string;
    platformUrl?: string;
  },
): Promise<ContentTargetItem> {
  return apiFetch(`/contents/${contentId}/targets/${targetId}/complete`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function cancelContentTarget(
  contentId: string,
  targetId: string,
): Promise<ContentTargetItem> {
  return apiFetch(`/contents/${contentId}/targets/${targetId}/cancel`, {
    method: "POST",
  });
}

export async function retryContentTarget(
  contentId: string,
  targetId: string,
): Promise<{ target: ContentTargetItem; dispatch: PublishDispatch }> {
  return apiFetch(`/contents/${contentId}/targets/${targetId}/retry`, {
    method: "POST",
  });
}

export type CoverKind = "portrait" | "landscape";
export type CoverUploadKind = CoverKind | "landscape2" | "landscape3";

function coverPath(
  contentId: string,
  kind: CoverUploadKind,
  targetId?: string,
): string {
  if (kind === "landscape2" || kind === "landscape3") {
    if (!targetId) {
      throw new Error("三图封面需要选择账号");
    }
    return `/contents/${contentId}/targets/${targetId}/cover-gallery/${kind === "landscape2" ? 2 : 3}`;
  }
  const suffix = kind === "portrait" ? "cover" : "cover-landscape";
  if (targetId) {
    return `/contents/${contentId}/targets/${targetId}/${suffix}`;
  }
  return `/contents/${contentId}/${suffix}`;
}

/** 封面预览 URL（带本机 token 需经 fetch 转 blob，见 fetchCoverObjectUrl） */
export function contentCoverUrl(
  contentId: string,
  kind: CoverUploadKind,
  targetId?: string,
): string {
  return `${getApiBaseUrl()}${coverPath(contentId, kind, targetId)}`;
}

/** 拉取封面为 object URL，调用方负责 revoke */
export async function fetchCoverObjectUrl(
  contentId: string,
  kind: CoverUploadKind,
  targetId?: string,
): Promise<string> {
  const headers = new Headers();
  if (localApiToken) {
    headers.set("X-Pugying-Local-Token", localApiToken);
  }
  const response = await fetch(contentCoverUrl(contentId, kind, targetId), {
    headers,
  });
  if (!response.ok) {
    throw new Error(`封面不可用（${response.status}）`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** 上传封面到内容或账号差异列 */
export async function uploadContentCover(
  contentId: string,
  kind: CoverUploadKind,
  file: File | Blob,
  fileName = "cover.jpg",
  targetId?: string,
): Promise<ContentItem> {
  const form = new FormData();
  form.append("file", file, fileName);
  return apiFetch<ContentItem>(coverPath(contentId, kind, targetId), {
    method: "PUT",
    body: form,
  });
}

export async function deleteContentCover(
  contentId: string,
  kind: CoverUploadKind,
  targetId?: string,
): Promise<ContentItem> {
  return apiFetch<ContentItem>(coverPath(contentId, kind, targetId), {
    method: "DELETE",
  });
}

/** Electron File → 本机绝对路径（选片与拖拽通用；Electron 32+ 无 File.path） */
export function getLocalFilePath(file: File): string | null {
  const bridge = getPugyingDesktopBridge();
  if (bridge?.getPathForFile) {
    try {
      const viaWebUtils = bridge.getPathForFile(file)?.trim();
      if (viaWebUtils) {
        return viaWebUtils;
      }
    } catch {
      // fall through
    }
  }
  // 兼容旧 Electron / 非桌面环境
  const legacy = (file as File & { path?: string }).path?.trim();
  return legacy || null;
}
