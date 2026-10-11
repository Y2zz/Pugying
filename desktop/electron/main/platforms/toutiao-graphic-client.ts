/**
 * 头条微头条 Cookie 直调：spice/image 上传 → /mp/agw/article/wtt 提交。
 * 实探无需页面签名 SDK / 隐藏窗；密钥与 Cookie 同属创作者会话。
 */
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { nativeImage } from "electron";
import type { AgentCookie } from "../protocol";
import { platformOutboundFetch } from "../network-policy";
import {
  ArticleApiError,
  articlePostId,
  assertArticleResponse,
  type UploadedArticleImage,
} from "./article-api";
import { buildCookieHeader } from "./douyin-http-client";

const MP_ORIGIN = "https://mp.toutiao.com";
const REFERER = `${MP_ORIGIN}/profile_v4/weitoutiao/publish`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
/** 微头条图文 upload_source（与 TOUTIAO_GRAPHIC_RUNTIME 一致） */
const UPLOAD_QUERY =
  "upload_source=20020004&aid=1231&device_platform=web";
const CREATE_PATH = "/mp/agw/article/wtt?aid=1231&mp_publish_ab_val=0";

export interface ToutiaoGraphicHttpResponse {
  status: number;
  body: Uint8Array;
}

export interface ToutiaoGraphicHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<ToutiaoGraphicHttpResponse>;
}

const defaultTransport: ToutiaoGraphicHttpTransport = {
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

/** 保留超大整数源串，避免 thread_id 被 JSON 舍入。 */
function parseJsonPreservingIds(body: Uint8Array): Record<string, unknown> {
  try {
    const text = Buffer.from(body).toString("utf8");
    const parsed = JSON.parse(text, (key, value, context) => {
      if (
        typeof value === "number" &&
        !Number.isSafeInteger(value) &&
        context &&
        typeof (context as { source?: string }).source === "string"
      ) {
        return (context as { source: string }).source;
      }
      return value;
    }) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
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

/** multipart/form-data；boundary 自生成，避免依赖 Node FormData 与 Electron fetch 差异。 */
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

export class ToutiaoGraphicClient {
  private readonly cookieHeader: string;
  private disposed = false;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: ToutiaoGraphicHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
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
    const response = await this.transport.request({
      url: `${MP_ORIGIN}/spice/image?${UPLOAD_QUERY}`,
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        Cookie: this.cookieHeader,
        "Content-Type": multipart.contentType,
        Origin: MP_ORIGIN,
        Referer: REFERER,
        "User-Agent": USER_AGENT,
      },
      body: multipart.body,
      timeoutMs: this.timeoutMs,
    });
    if (response.status === 401 || response.status === 403) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const json = parseJsonPreservingIds(response.body);
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
    const width = Number(data.image_width ?? data.origin_image_width ?? size.width);
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

  async createWtt(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertOpen();
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const body = Buffer.from(JSON.stringify(data), "utf8");
    let response: ToutiaoGraphicHttpResponse;
    try {
      response = await this.transport.request({
        url: `${MP_ORIGIN}${CREATE_PATH}`,
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          Cookie: this.cookieHeader,
          "Content-Type": "application/json; charset=utf-8",
          Origin: MP_ORIGIN,
          Referer: REFERER,
          "User-Agent": USER_AGENT,
        },
        body,
        timeoutMs: 120_000,
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

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new ArticleApiError("cancelled", "发布已取消");
    }
  }
}

/** 从 wtt 回执取出微头条 ID。 */
export function toutiaoGraphicPostId(
  response: Record<string, unknown>,
): string {
  assertArticleResponse(response, "toutiao", true);
  const data = asRecord(response.data);
  return articlePostId(data.threadId ?? data.thread_id);
}
