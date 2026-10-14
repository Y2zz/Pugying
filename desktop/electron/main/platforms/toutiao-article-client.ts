/**
 * 头条文章 主进程会话：spice（upload_source=20020003）上传 →
 * form-urlencoded `/mp/agw/article/publish`。主进程会话完成上传与提交。
 */
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { nativeImage } from "electron";
import { parseToutiaoRewardFromPublishHtml } from "@shared/toutiao-article-privileges";
import type { AgentCookie } from "../protocol";
import { platformOutboundFetch } from "../network-policy";
import {
  ArticleApiError,
  type ArticleApiSession,
  type UploadedArticleImage,
} from "./article-api";
import { buildCookieHeader } from "./douyin-http-client";
import { parseJsonPreservingIds } from "./parse-json-preserving-ids";

const MP_ORIGIN = "https://mp.toutiao.com";
const REFERER = `${MP_ORIGIN}/profile_v4/graphic/publish`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
/** 文章插图 upload_source（与 TOUTIAO_ARTICLE_RUNTIME 一致；微头条为 20020004） */
const UPLOAD_QUERY =
  "upload_source=20020003&aid=1231&device_platform=web";

export interface ToutiaoArticleHttpResponse {
  status: number;
  body: Uint8Array;
}

export interface ToutiaoArticleHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<ToutiaoArticleHttpResponse>;
}

const defaultTransport: ToutiaoArticleHttpTransport = {
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
      return {
        status: response.status,
        body: new Uint8Array(await response.arrayBuffer()),
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

function buildMultipart(
  field: string,
  fileName: string,
  mime: string,
  bytes: Buffer,
): { body: Buffer; contentType: string } {
  const boundary = `----pugying${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${field}"; filename="${fileName}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    body: Buffer.concat([
      Buffer.from(head, "utf8"),
      bytes,
      Buffer.from(tail, "utf8"),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** encodeURIComponent 表单值（空格 → %20）。 */
function encodeForm(data: Record<string, unknown>): Buffer {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }
  return Buffer.from(parts.join("&"), "utf8");
}

export class ToutiaoArticleClient implements ArticleApiSession {
  private readonly cookieHeader: string;
  private disposed = false;
  private rewardRemaining: number | null = null;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: ToutiaoArticleHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
  }

  private baseHeaders(
    extra?: Record<string, string>,
  ): Record<string, string> {
    return {
      Accept: "application/json, text/plain, */*",
      Cookie: this.cookieHeader,
      Origin: MP_ORIGIN,
      Referer: REFERER,
      "User-Agent": USER_AGENT,
      ...extra,
    };
  }

  private async fetchJson(
    method: string,
    url: string,
    body?: Uint8Array,
    contentType?: string,
  ): Promise<Record<string, unknown>> {
    this.assertOpen();
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    let response: ToutiaoArticleHttpResponse;
    try {
      response = await this.transport.request({
        url,
        method,
        headers: this.baseHeaders(
          contentType ? { "Content-Type": contentType } : undefined,
        ),
        body,
        timeoutMs: method === "POST" ? 120_000 : this.timeoutMs,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || /aborted|timeout/i.test(error.message))
      ) {
        throw new ArticleApiError(
          "HTTP_TIMEOUT",
          "暂时无法连接发布平台",
        );
      }
      throw new ArticleApiError(
        "HTTP_REQUEST_FAILED",
        "暂时无法连接发布平台",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ArticleApiError(
        "HTTP_REQUEST_FAILED",
        "暂时无法连接发布平台",
      );
    }
    return parseJsonPreservingIds(response.body);
  }

  /** 发布页 HTML 内嵌 praise_count_remained；仅预检赞赏时读取一次。 */
  private async ensureRewardRemaining(): Promise<number> {
    if (this.rewardRemaining != null) {
      return this.rewardRemaining;
    }
    const response = await this.transport.request({
      url: REFERER,
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: this.cookieHeader,
        "User-Agent": USER_AGENT,
      },
      timeoutMs: this.timeoutMs,
    });
    const html = Buffer.from(response.body).toString("utf8");
    const privilege = parseToutiaoRewardFromPublishHtml(html);
    this.rewardRemaining = privilege?.remainingToday ?? 0;
    return this.rewardRemaining;
  }

  async request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = path.startsWith("http") ? path : `${MP_ORIGIN}${path}`;
    if (data === undefined) {
      const result = await this.fetchJson("GET", url);
      if (path.startsWith("/mp/agw/article/new?")) {
        return {
          ...result,
          __pugyingRewardRemaining: await this.ensureRewardRemaining(),
        };
      }
      return result;
    }
    return this.fetchJson(
      "POST",
      url,
      encodeForm(data),
      "application/x-www-form-urlencoded;charset=UTF-8",
    );
  }

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
    const multipart = buildMultipart(
      "image",
      basename(path) || "image.png",
      mime,
      bytes,
    );
    const json = await this.fetchJson(
      "POST",
      `${MP_ORIGIN}/spice/image?${UPLOAD_QUERY}`,
      multipart.body,
      multipart.contentType,
    );
    if (Number(json.code) !== 0) {
      if (Number(json.code) === 401 || Number(json.code) === -1) {
        throw new ArticleApiError(
          "AUTH_EXPIRED",
          "账号登录已失效，请重新授权",
        );
      }
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }
    const data = asRecord(json.data);
    const uri = String(
      data.origin_image_uri ?? data.image_uri ?? "",
    ).trim();
    const url = String(data.origin_image_url ?? data.image_url ?? "")
      .trim()
      .replace(/^http:/, "https:")
      .replace(/^\/\//, "https://");
    const width = Number(
      data.image_width ?? data.origin_image_width ?? size.width,
    );
    const height = Number(
      data.image_height ?? data.origin_image_height ?? size.height,
    );
    if (!uri || !/^https:\/\//.test(url) || !(width > 0) || !(height > 0)) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }
    return {
      uri,
      url,
      width,
      height,
      size: bytes.length / 1024,
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new ArticleApiError("cancelled", "发布已取消");
    }
  }
}
