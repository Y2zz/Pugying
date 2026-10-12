/**
 * 小红书图文 Cookie 直调：创作者域 permit → ROS PUT → edith 签名发帖。
 * 上传无需 x-s；发帖用主进程 XYS_ 签名（见 xiaohongshu-xs-sign）。
 */
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { nativeImage } from "electron";
import type { AgentCookie } from "../protocol";
import { platformOutboundFetch } from "../network-policy";
import {
  ArticleApiError,
  articleRecord,
  type UploadedArticleImage,
} from "./article-api";
import { buildCookieHeader } from "./douyin-http-client";
import {
  signXiaohongshuPostHeaders,
  XiaohongshuXsSignError,
  XHS_DEFAULT_XSEC_APPID,
} from "./xiaohongshu-xs-sign";

const CREATOR_ORIGIN = "https://creator.xiaohongshu.com";
const EDITH_ORIGIN = "https://edith.xiaohongshu.com";
const NOTE_PATH = "/web_api/sns/v2/note";
const PERMIT_PATH =
  "/api/media/v1/upload/web/permit?biz_name=spectrum&scene=image&file_count=1&version=1&source=web";
const REFERER = `${CREATOR_ORIGIN}/publish/publish?source=official&target=image`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
const NOTE_ID_RE = /^[a-f0-9]{24}$/;

export interface XiaohongshuGraphicHttpResponse {
  status: number;
  body: Uint8Array;
  headers?: Record<string, string>;
}

export interface XiaohongshuGraphicHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<XiaohongshuGraphicHttpResponse>;
}

const defaultTransport: XiaohongshuGraphicHttpTransport = {
  async request(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);
    try {
      const response = await platformOutboundFetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body as BodyInit | undefined,
        signal: controller.signal,
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return {
        status: response.status,
        body: new Uint8Array(await response.arrayBuffer()),
        headers,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJson(body: Uint8Array): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(Buffer.from(body).toString("utf8")));
  } catch {
    return {};
  }
}

function cookieMap(cookies: AgentCookie[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cookie of cookies) {
    if (cookie.name && cookie.value != null && cookie.value !== "") {
      map[cookie.name] = cookie.value;
    }
  }
  return map;
}

function imageMime(bytes: Buffer): string {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  throw new ArticleApiError(
    "ARTICLE_IMAGE_UNSUPPORTED",
    "该平台需要 JPEG 或 PNG 图片，请重新选择",
  );
}

export class XiaohongshuGraphicClient {
  private readonly cookieHeader: string;
  private readonly a1: string;
  private disposed = false;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: XiaohongshuGraphicHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
    this.a1 = cookieMap(cookies).a1 ?? "";
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new ArticleApiError("PUBLISH_FAILED", "图文发布未成功，请稍后重试");
    }
  }

  private baseHeaders(): Record<string, string> {
    return {
      "User-Agent": USER_AGENT,
      Cookie: this.cookieHeader,
      Accept: "application/json, text/plain, */*",
      Origin: CREATOR_ORIGIN,
      Referer: REFERER,
    };
  }

  /** 创作者域取临时上传许可，再 ROS PUT；返回 file_id 作为 uri。 */
  async uploadImage(path: string): Promise<UploadedArticleImage> {
    this.assertOpen();
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    if (!isAbsolute(path)) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到图片，请重新选择");
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到图片，请重新选择");
    }
    if (info.size > 20 * 1024 * 1024) {
      throw new ArticleApiError(
        "ARTICLE_IMAGE_UNSUPPORTED",
        "图片不能超过 20MB",
      );
    }
    const bytes = await readFile(path);
    const mime = imageMime(bytes);
    const image = nativeImage.createFromBuffer(bytes);
    const size = image.getSize();
    if (!(size.width > 0) || !(size.height > 0)) {
      throw new ArticleApiError(
        "ARTICLE_IMAGE_UNSUPPORTED",
        "请使用 JPEG、PNG 或平台支持的图片格式",
      );
    }

    const permitRes = await this.transport.request({
      url: `${CREATOR_ORIGIN}${PERMIT_PATH}`,
      method: "GET",
      headers: this.baseHeaders(),
      timeoutMs: this.timeoutMs,
    });
    const permit = parseJson(permitRes.body);
    if (permitRes.status === 401 || permitRes.status === 403) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const permits = asRecord(permit.data).uploadTempPermits;
    const first = Array.isArray(permits) ? asRecord(permits[0]) : {};
    const fileIds = Array.isArray(first.fileIds) ? first.fileIds : [];
    const fileId = String(fileIds[0] ?? "").trim();
    const token = String(first.token ?? "").trim();
    const uploadAddr = String(first.uploadAddr ?? "").trim();
    if (
      permit.success !== true ||
      permit.code !== 0 ||
      !fileId ||
      !token ||
      !uploadAddr
    ) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法上传图片，请稍后重试",
      );
    }
    const host = uploadAddr.startsWith("http")
      ? uploadAddr.replace(/\/$/, "")
      : `https://${uploadAddr}`;
    const putRes = await this.transport.request({
      url: `${host}/${fileId}`,
      method: "PUT",
      headers: {
        ...this.baseHeaders(),
        "Content-Type": mime,
        "X-Cos-Security-Token": token,
      },
      body: bytes,
      timeoutMs: this.timeoutMs,
    });
    if (putRes.status !== 200 && putRes.status !== 201) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法上传图片，请稍后重试",
      );
    }
    return {
      uri: fileId,
      url: putRes.headers?.["x-ros-preview-url"] ?? "",
      width: size.width,
      height: size.height,
      size: bytes.length,
    };
  }

  /**
   * edith 发帖；请求体与签名共用同一 JSON 序列化结果。
   * 成功时 data.id 为 24 位 hex；官方偶发补 code=N/A。
   */
  async createNote(
    data: Record<string, unknown>,
  ): Promise<{ id: string; raw: Record<string, unknown> }> {
    this.assertOpen();
    if (!this.a1) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    let signed: { "x-s": string; "x-t": string };
    try {
      // 实跑以 xhs-pc-web 载荷通过；Cookie 的 xsecappid=ugc 是外层业务标识，不写入签名载荷
      signed = signXiaohongshuPostHeaders(NOTE_PATH, this.a1, data, {
        xsecAppid: XHS_DEFAULT_XSEC_APPID,
      });
    } catch (error) {
      if (error instanceof XiaohongshuXsSignError) {
        throw new ArticleApiError(
          "ARTICLE_API_CHANGED",
          "暂时无法自动发布，请稍后重试",
        );
      }
      throw error;
    }
    const bodyText = JSON.stringify(data);
    const response = await this.transport.request({
      url: `${EDITH_ORIGIN}${NOTE_PATH}`,
      method: "POST",
      headers: {
        ...this.baseHeaders(),
        "Content-Type": "application/json;charset=UTF-8",
        "x-s": signed["x-s"],
        "x-t": signed["x-t"],
      },
      body: Buffer.from(bodyText, "utf8"),
      timeoutMs: this.timeoutMs,
    });
    const parsed = parseJson(response.body);
    if (response.status === 401 || response.status === 403) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    if (response.status === 406) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法自动发布，请稍后重试",
      );
    }
    const code = parsed.code;
    const success = parsed.success === true;
    // Cookie 直调成功时常无 code；页面 SDK 路径可能补 "N/A"
    if (!success || (code != null && code !== 0 && code !== "N/A")) {
      if (code === -100 || code === -10001) {
        throw new ArticleApiError(
          "AUTH_EXPIRED",
          "账号登录已失效，请重新授权",
        );
      }
      if (typeof code !== "number") {
        throw new ArticleApiError(
          "PUBLISH_RESULT_UNKNOWN",
          "尚未确认发布结果，请先到平台查看",
        );
      }
      throw new ArticleApiError(
        "PLATFORM_REJECTED",
        "平台未接受本次发布，请到创作者中心查看账号或内容要求",
      );
    }
    const id = articleRecord(parsed.data).id;
    if (typeof id !== "string" || !NOTE_ID_RE.test(id)) {
      throw new ArticleApiError(
        "PUBLISH_RESULT_UNKNOWN",
        "尚未确认发布结果，请先到平台查看",
      );
    }
    return { id, raw: parsed };
  }
}

export function xiaohongshuGraphicPostId(
  response: { id: string } | Record<string, unknown>,
): string {
  if ("id" in response && typeof response.id === "string") {
    return response.id;
  }
  const id = articleRecord(asRecord(response).data).id;
  if (typeof id === "string" && NOTE_ID_RE.test(id)) {
    return id;
  }
  throw new ArticleApiError(
    "PUBLISH_RESULT_UNKNOWN",
    "尚未确认发布结果，请先到平台查看",
  );
}
