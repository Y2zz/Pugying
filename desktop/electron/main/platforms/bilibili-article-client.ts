/**
 * B 站专栏：主进程会话完成 WBI 签名、图片上传与发帖。
 * 遇 -352 风控时提示用户到创作者中心完成验证。
 */
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { nativeImage } from "electron";
import type { AgentCookie } from "../protocol";
import { platformOutboundFetch } from "../network-policy";
import {
  ArticleApiError,
  articleRecord,
  type ArticleApiSession,
  type UploadedArticleImage,
} from "./article-api";
import { signBilibiliQuery } from "./bilibili-wbi";
import { buildCookieHeader } from "./douyin-http-client";
import { parseJsonPreservingIds } from "./parse-json-preserving-ids";

const API_ORIGIN = "https://api.bilibili.com";
const MEMBER_ORIGIN = "https://member.bilibili.com";
// Electron/Chromium 会取消带 query 的跨站 Referer（invalid referrer），
// 导致 api.bilibili.com/nav 直接失败并映射为「暂时无法连接发布平台」。
const REFERER = `${MEMBER_ORIGIN}/`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

/** 与 bilibili-cookie-api / 编辑器 wbiParams 对齐（无页面 access_id）。 */
const WBI_WEB_PARAMS: Record<string, string> = {
  "x-bili-locale-json": JSON.stringify({
    c_locale: { language: "zh", script: "Hans" },
    always_translate: false,
  }),
  "x-bili-device-req-json": JSON.stringify({
    platform: "web",
    device: "pc",
    spmid: "0.0",
    mobi_app: "web_cn",
  }),
};

export interface BilibiliArticleHttpResponse {
  status: number;
  body: Uint8Array;
  headers: Record<string, string>;
}

export interface BilibiliArticleHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<BilibiliArticleHttpResponse>;
}

const defaultTransport: BilibiliArticleHttpTransport = {
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

function wbiKeyFromUrl(url: unknown): string {
  if (typeof url !== "string" || !url) {
    return "";
  }
  try {
    return new URL(url).pathname.split("/").pop()?.split(".")[0] || "";
  } catch {
    return "";
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
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  ) {
    return "image/webp";
  }
  throw new ArticleApiError(
    "ARTICLE_IMAGE_UNSUPPORTED",
    "请使用 JPEG、PNG 或平台支持的图片格式",
  );
}

function buildMultipart(
  fields: Array<{ name: string; value: string | Buffer; fileName?: string; mime?: string }>,
): { body: Buffer; contentType: string } {
  const boundary = `----pugying${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const field of fields) {
    if (typeof field.value === "string") {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
          "utf8",
        ),
      );
    } else {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"; filename="${field.fileName || "image.png"}"\r\nContent-Type: ${field.mime || "application/octet-stream"}\r\n\r\n`,
          "utf8",
        ),
      );
      chunks.push(field.value);
      chunks.push(Buffer.from("\r\n", "utf8"));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export class BilibiliArticleClient implements ArticleApiSession {
  private readonly cookieHeader: string;
  private readonly csrf: string;
  private disposed = false;
  private wbiKeys: { image: string; sub: string } | null = null;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: BilibiliArticleHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
    this.csrf =
      cookies.find((cookie) => cookie.name === "bili_jct")?.value?.trim() ??
      "";
  }

  private baseHeaders(
    extra?: Record<string, string>,
  ): Record<string, string> {
    return {
      Accept: "application/json, text/plain, */*",
      Cookie: this.cookieHeader,
      Origin: MEMBER_ORIGIN,
      Referer: REFERER,
      "User-Agent": USER_AGENT,
      ...extra,
    };
  }

  private async ensureWbi(): Promise<{ image: string; sub: string }> {
    if (this.wbiKeys) {
      return this.wbiKeys;
    }
    const nav = await this.rawRequest(
      "GET",
      `${API_ORIGIN}/x/web-interface/nav`,
    );
    if (Number(nav.json.code) !== 0) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const data = articleRecord(nav.json.data);
    if (data.isLogin !== true) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const images = articleRecord(data.wbi_img);
    const image = wbiKeyFromUrl(images.img_url);
    const sub = wbiKeyFromUrl(images.sub_url);
    if (!image || !sub) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法自动发布，请稍后重试",
      );
    }
    this.wbiKeys = { image, sub };
    return this.wbiKeys;
  }

  private async rawRequest(
    method: string,
    url: string,
    body?: Uint8Array,
    contentType?: string,
  ): Promise<{ json: Record<string, unknown>; headers: Record<string, string> }> {
    this.assertOpen();
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    let response: BilibiliArticleHttpResponse;
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
    const json = parseJsonPreservingIds(response.body);
    if (Number(json.code) === -352 || response.headers["x-bili-gaia-vvoucher"]) {
      throw new ArticleApiError(
        "PLATFORM_VERIFICATION_REQUIRED",
        "平台需要验证，请到创作者中心完成后再发布",
      );
    }
    return { json, headers: response.headers };
  }

  private async signedUrl(
    pathWithQuery: string,
    extraParams: Record<string, string> = {},
  ): Promise<string> {
    const keys = await this.ensureWbi();
    const url = new URL(pathWithQuery, API_ORIGIN);
    const params: Record<string, string> = {
      ...WBI_WEB_PARAMS,
      ...Object.fromEntries(url.searchParams.entries()),
      ...extraParams,
    };
    const query = signBilibiliQuery(params, keys.image, keys.sub);
    return `${API_ORIGIN}${url.pathname}?${query}`;
  }

  async request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (data === undefined) {
      const signed = await this.signedUrl(path);
      const { json } = await this.rawRequest("GET", signed);
      return json;
    }
    if (!this.csrf) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    // 请求需附带 csrf、gaia_source 与 dm_img_switch=0
    const signed = await this.signedUrl(path, {
      csrf: this.csrf,
      gaia_source: "main_web",
      dm_img_switch: "0",
    });
    const { json } = await this.rawRequest(
      "POST",
      signed,
      Buffer.from(JSON.stringify(data), "utf8"),
      "application/json",
    );
    return json;
  }

  async uploadImage(path: string): Promise<UploadedArticleImage> {
    this.assertOpen();
    if (!this.csrf) {
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
    const signed = await this.signedUrl("/x/dynamic/feed/draw/upload_bfs");
    const multipart = buildMultipart([
      {
        name: "file_up",
        value: bytes,
        fileName: basename(path) || "image.png",
        mime,
      },
      { name: "biz", value: "new_dyn" },
      { name: "category", value: "daily" },
      { name: "csrf", value: this.csrf },
    ]);
    const { json } = await this.rawRequest(
      "POST",
      signed,
      multipart.body,
      multipart.contentType,
    );
    if (Number(json.code) !== 0) {
      if ([-101, 401, -2].includes(Number(json.code))) {
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
    const data = articleRecord(json.data);
    const url = String(data.image_url ?? "")
      .trim()
      .replace(/^http:/, "https:");
    const width = Number(data.image_width ?? size.width);
    const height = Number(data.image_height ?? size.height);
    if (!/^https:\/\//.test(url) || !(width > 0) || !(height > 0)) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }
    return {
      uri: url,
      url,
      width,
      height,
      size: Number(data.img_size ?? bytes.length / 1024),
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
