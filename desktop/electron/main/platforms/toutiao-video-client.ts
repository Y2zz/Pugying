/**
 * 头条西瓜视频 Cookie 直调：getAuthKey → VAS GetVideoUploadParams →
 * TOS `/upload/v1`（官方同款 part 分片：init → transfer → finish）→
 * UpdateVideoUploadInfos → PublishVideo。
 * 使用 object 上传（middlevideo_toutiao）；VOD STS 回执投稿会 21028 provider 非法。
 *
 * 生产须经 createToutiaoVideoClient：ephemeral Session + injectCookies。
 * defaultSession + 手写 Cookie 头时，GetPublishAuth 的 Set-Cookie 进 jar 后
 * 后续 getAuthKey 可能只带上 CSRF、丢掉登录态（status=-12 no login）。
 */
import { randomUUID } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { crc32 } from "node:zlib";
import { nativeImage, type Session } from "electron";
import { injectCookies } from "../auth-browser";
import type { AgentCookie } from "../protocol";
import {
  createNetworkSession,
  platformOutboundFetch,
} from "../network-policy";
import {
  ArticleApiError,
  type UploadedArticleImage,
} from "./article-api";
import {
  clampUploadConcurrency,
  DEFAULT_UPLOAD_CONCURRENCY,
  mapPool,
} from "./chunk-pool";
import { createUploadMeter } from "./upload-progress";
import { buildCookieHeader } from "./douyin-http-client";
import { parseJsonPreservingIds } from "./parse-json-preserving-ids";
import type {
  UploadedVideo,
  VideoUploadOptions,
  VideoUploadProgress,
} from "./video-api";

const MP_ORIGIN = "https://mp.toutiao.com";
const VAS_ORIGIN = "https://vas-lf-x.snssdk.com";
const REFERER = `${MP_ORIGIN}/profile_v4/xigua/upload-video`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
/** 视频封面与微头条共用 spice upload_source */
const IMAGE_UPLOAD_QUERY =
  "upload_source=20020004&aid=1231&device_platform=web";
/** 与创作者页一致：视频 32GB */
const MAX_VIDEO_BYTES = 32 * 1024 * 1024 * 1024;
/** 官方 Uploader 常用 5MB 分片；末片可更小 */
const TOS_PART_SIZE = 5 * 1024 * 1024;
const TOS_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export interface ToutiaoVideoHttpResponse {
  status: number;
  body: Uint8Array;
  headers: Record<string, string>;
  /** 原始 Set-Cookie，用于合并 xigua_csrf_token */
  setCookie: string[];
}

export interface ToutiaoVideoHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<ToutiaoVideoHttpResponse>;
}

const defaultTransport: ToutiaoVideoHttpTransport = {
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
      const setCookie =
        typeof response.headers.getSetCookie === "function"
          ? response.headers.getSetCookie()
          : [];
      return {
        status: response.status,
        body: new Uint8Array(await response.arrayBuffer()),
        headers,
        setCookie,
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

/** 把 Set-Cookie 名值对并入 Cookie 头（同名覆盖）；始终以 seed 为底，避免只剩 CSRF。 */
function mergeSetCookies(cookieHeader: string, setCookies: string[]): string {
  const map = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }
  for (const raw of setCookies) {
    const pair = raw.split(";")[0]?.trim() ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) {
      map.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function bufferCrc32Hex(bytes: Buffer): string {
  return (crc32(bytes) >>> 0).toString(16).padStart(8, "0");
}

function sessionBoundTransport(
  isolated: Session,
): ToutiaoVideoHttpTransport {
  return {
    async request(options) {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, options.timeoutMs);
      try {
        // Cookie 只走 jar（injectCookies）；删掉头里的 Cookie，避免与 jar 打架
        const headers: Record<string, string> = { ...options.headers };
        delete headers.Cookie;
        delete headers.cookie;
        const response = await isolated.fetch(options.url, {
          method: options.method,
          headers,
          body: options.body as BodyInit | undefined,
          credentials: "include",
          signal: controller.signal,
        });
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key.toLowerCase()] = value;
        });
        const setCookie =
          typeof response.headers.getSetCookie === "function"
            ? response.headers.getSetCookie()
            : [];
        return {
          status: response.status,
          body: new Uint8Array(await response.arrayBuffer()),
          headers: responseHeaders,
          setCookie,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface ToutiaoUploadedVideo extends UploadedVideo {
  /** 投稿 VideoInfo.Uri；object 上传为 Update 回执中的 video.oid */
  uploadResult?: Record<string, unknown>;
}

export class ToutiaoVideoClient {
  /** 构造时的登录 Cookie；absorb 始终以此为底再叠 Set-Cookie */
  private readonly seedCookieHeader: string;
  private cookieHeader: string;
  private csrfToken = "";
  private disposed = false;
  private sessionCleanup: (() => Promise<void>) | null = null;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: ToutiaoVideoHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
    /** 单测可调低分片阈值，无需造 5MB+ 夹具 */
    private readonly tosPartSize = TOS_PART_SIZE,
  ) {
    this.seedCookieHeader = buildCookieHeader(cookies);
    this.cookieHeader = this.seedCookieHeader;
  }

  /** 仅供 createToutiaoVideoClient 挂载 ephemeral Session 清理 */
  bindSessionCleanup(cleanup: () => Promise<void>): void {
    this.sessionCleanup = cleanup;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.sessionCleanup) {
      const cleanup = this.sessionCleanup;
      this.sessionCleanup = null;
      await cleanup().catch(() => {});
    }
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new ArticleApiError("cancelled", "发布已取消");
    }
  }

  private baseHeaders(
    extra: Record<string, string> = {},
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

  private absorbCookies(response: ToutiaoVideoHttpResponse): void {
    if (response.setCookie.length > 0) {
      // seed 保底登录态；再叠当前头与本次 Set-Cookie（CSRF 等同名覆盖）
      const extras = [
        ...this.cookieHeader
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean),
        ...response.setCookie,
      ];
      this.cookieHeader = mergeSetCookies(this.seedCookieHeader, extras);
    }
    const match = this.cookieHeader.match(/xigua_csrf_token=([^;]+)/);
    if (match?.[1]) {
      this.csrfToken = match[1];
    }
  }

  /**
   * 兼容 VideoApiSession.request：无 body 为 GET，有 body 为 JSON POST。
   * 西瓜写接口需要 x-csrf-token（由 GetPublishAuth 的 Set-Cookie 提供）。
   */
  async request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertOpen();
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const url = path.startsWith("http") ? path : `${MP_ORIGIN}${path}`;
    const method = data === undefined ? "GET" : "POST";
    if (method === "POST" && !this.csrfToken) {
      // 首次写操作前先拉 CSRF
      await this.ensureCsrf();
    }
    const headers = this.baseHeaders(
      method === "POST"
        ? {
            "Content-Type": "application/json",
            "x-csrf-token": this.csrfToken,
          }
        : {},
    );
    let response: ToutiaoVideoHttpResponse;
    try {
      response = await this.transport.request({
        url,
        method,
        headers,
        body:
          data === undefined
            ? undefined
            : Buffer.from(JSON.stringify(data), "utf8"),
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
    this.absorbCookies(response);
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

  private async ensureCsrf(): Promise<void> {
    if (this.csrfToken) {
      return;
    }
    const response = await this.transport.request({
      url: `${MP_ORIGIN}/xigua/api/upload/GetPublishAuth`,
      method: "GET",
      headers: this.baseHeaders(),
      timeoutMs: this.timeoutMs,
    });
    this.absorbCookies(response);
    if (!this.csrfToken) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法自动发布，请稍后重试",
      );
    }
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
        "该平台需要 JPEG 或 PNG 图片，请重新选择",
      );
    }
    const multipart = buildMultipart(
      "image",
      basename(path) || "image.png",
      mime,
      bytes,
    );
    const response = await this.transport.request({
      url: `${MP_ORIGIN}/spice/image?${IMAGE_UPLOAD_QUERY}`,
      method: "POST",
      headers: this.baseHeaders({
        "Content-Type": multipart.contentType,
      }),
      body: multipart.body,
      timeoutMs: this.timeoutMs,
    });
    this.absorbCookies(response);
    if (response.status === 401 || response.status === 403) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const json = parseJsonPreservingIds(response.body);
    if (Number(json.code) !== 0) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }
    const data = asRecord(json.data);
    const uri = String(data.origin_image_uri ?? data.image_uri ?? "").trim();
    const url = String(data.origin_image_url ?? data.image_url ?? "")
      .trim()
      .replace(/^http:/, "https:")
      .replace(/^\/\//, "https://");
    const width = Number(data.image_width ?? size.width);
    const height = Number(data.image_height ?? size.height);
    if (!uri || !/^https:\/\//.test(url) || !(width > 0) || !(height > 0)) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }
    return { uri, url, width, height, size: bytes.length / 1024 };
  }

  /**
   * TOS object 分片：init → 各 part transfer（Content-CRC32）→ finish。
   * 与官方西瓜 Uploader（第五参数 false / middlevideo_toutiao）同协议。
   */
  private async uploadTosParts(options: {
    host: string;
    oid: string;
    tosSign: string;
    path: string;
    size: number;
    partSize: number;
    onProgress?: (progress: VideoUploadProgress) => void;
  }): Promise<void> {
    const { host, oid, tosSign, path, size, partSize, onProgress } = options;
    const objectUrl = `${host}/upload/v1/${oid}`;
    const partTimeout = Math.max(this.timeoutMs, TOS_UPLOAD_TIMEOUT_MS);
    const authHeaders = {
      Authorization: tosSign,
      "User-Agent": USER_AGENT,
    };

    const initRes = await this.transport.request({
      url: `${objectUrl}?uploadmode=part&phase=init`,
      method: "POST",
      headers: authHeaders,
      timeoutMs: this.timeoutMs,
    });
    const initJson = parseJsonPreservingIds(initRes.body);
    const initData = asRecord(initJson.data);
    const uploadId = String(
      initData.uploadid ?? initData.uploadId ?? initData.upload_id ?? "",
    ).trim();
    if (Number(initJson.code) !== 2000 || !uploadId) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
        { stage: "tos_part_init", status: initRes.status },
      );
    }

    const partCount = Math.ceil(size / partSize);
    const crcParts = new Array<string>(partCount);
    const meter = createUploadMeter(size, onProgress);
    meter.start();
    const concurrency = clampUploadConcurrency(
      DEFAULT_UPLOAD_CONCURRENCY,
      DEFAULT_UPLOAD_CONCURRENCY,
    );
    await mapPool(partCount, concurrency, async (index) => {
      this.assertOpen();
      const offset = index * partSize;
      const length = Math.min(partSize, size - offset);
      const buf = Buffer.alloc(length);
      // 每路单独 open，避免同一 FileHandle 并发 read
      const file = await open(path, "r");
      try {
        await file.read(buf, 0, length, offset);
      } finally {
        await file.close();
      }
      const crc = bufferCrc32Hex(buf);
      const partNumber = index + 1;
      const transferRes = await this.transport.request({
        url:
          `${objectUrl}?uploadid=${encodeURIComponent(uploadId)}` +
          `&part_number=${partNumber}&part_offset=${offset}&phase=transfer`,
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/octet-stream",
          "Content-CRC32": crc,
        },
        body: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
        timeoutMs: partTimeout,
      });
      const transferJson = parseJsonPreservingIds(transferRes.body);
      const remoteCrc = String(
        asRecord(transferJson.data).crc32 ?? "",
      ).trim();
      if (
        transferRes.status >= 300 ||
        Number(transferJson.code) !== 2000 ||
        (remoteCrc && remoteCrc.toLowerCase() !== crc.toLowerCase())
      ) {
        throw new ArticleApiError(
          "ARTICLE_API_CHANGED",
          "未能确认视频上传结果，请稍后重试",
          {
            stage: "tos_part_transfer",
            part: partNumber,
            status: transferRes.status,
          },
        );
      }
      crcParts[index] = `${partNumber}:${crc}`;
      meter.add(length);
    });

    const finishBody = crcParts.join(",");
    const finishRes = await this.transport.request({
      url:
        `${objectUrl}?uploadid=${encodeURIComponent(uploadId)}` +
        `&phase=finish&uploadmode=part`,
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "text/plain",
      },
      body: Buffer.from(finishBody, "utf8"),
      timeoutMs: this.timeoutMs,
    });
    const finishJson = parseJsonPreservingIds(finishRes.body);
    if (
      finishRes.status >= 300 ||
      Number(finishJson.code) !== 2000
    ) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
        { stage: "tos_part_finish", status: finishRes.status },
      );
    }
    meter.finish();
  }

  /**
   * object 上传：getAuthKey → GetVideoUploadParams → TOS 分片 → UpdateVideoUploadInfos。
   * 投稿侧依赖 Update 回执中的 video.oid 作为 Uri；勿改用 VOD STS（会 21028）。
   */
  async uploadVideo(
    path: string,
    options?: VideoUploadOptions,
  ): Promise<ToutiaoUploadedVideo> {
    this.assertOpen();
    if (!isAbsolute(path)) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
    }
    if (info.size <= 0 || info.size > MAX_VIDEO_BYTES) {
      throw new ArticleApiError("VIDEO_UNSUPPORTED", "请检查视频后重试");
    }
    await this.ensureCsrf();

    const authRes = await this.transport.request({
      url: `${MP_ORIGIN}/xigua/api/upload/getAuthKey/?type=video&ugc=false&useImageX=true`,
      method: "GET",
      headers: this.baseHeaders({ "x-csrf-token": this.csrfToken }),
      timeoutMs: this.timeoutMs,
    });
    this.absorbCookies(authRes);
    const authJson = parseJsonPreservingIds(authRes.body);
    // status=-12 / no login：登录态丢失（常见于 Cookie 头与 jar 不同步）
    if (Number(authJson.status) === -12) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    if (Number(authJson.status) !== 0) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }
    const authData = asRecord(authJson.data);
    const accessKey = String(authData.accessKey ?? "").trim();
    const uploadToken = String(authData.uploadToken ?? "").trim();
    if (!accessKey || !uploadToken) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }

    const paramsRes = await this.transport.request({
      url: `${VAS_ORIGIN}/video/openapi/v1/?action=GetVideoUploadParams`,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-TT-Access": accessKey,
        Authorization: uploadToken,
      },
      body: Buffer.from("{}", "utf8"),
      timeoutMs: this.timeoutMs,
    });
    const paramsJson = parseJsonPreservingIds(paramsRes.body);
    if (Number(paramsJson.code) !== 2000) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }
    const params = asRecord(paramsJson.data);
    const vid = String(params.vid ?? "").trim();
    const oid = String(params.oid ?? "").trim();
    const tosHost = String(params.tos_host ?? "").trim();
    const tosSign = String(params.tos_sign ?? "").trim();
    const token = String(params.token ?? "").trim();
    const extraParam = String(params.extra_param ?? "").trim();
    if (!vid || !oid || !tosHost || !tosSign || !token) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }

    const host = tosHost.startsWith("http")
      ? tosHost.replace(/\/$/, "")
      : `https://${tosHost}`;
    // 小文件仍走官方 serial 整文件；超过分片阈值走 part（与创作者页 Uploader 一致）
    if (info.size <= this.tosPartSize) {
      const bytes = await readFile(path);
      const meter = createUploadMeter(info.size, options?.onProgress);
      meter.start();
      const putRes = await this.transport.request({
        url: `${host}/upload/v1/${oid}`,
        method: "POST",
        headers: {
          Authorization: tosSign,
          "Content-CRC32": bufferCrc32Hex(bytes),
          "Content-Type": "application/octet-stream",
          "User-Agent": USER_AGENT,
        },
        body: bytes,
        timeoutMs: Math.max(this.timeoutMs, TOS_UPLOAD_TIMEOUT_MS),
      });
      const putJson = parseJsonPreservingIds(putRes.body);
      if (
        putRes.status >= 300 ||
        (putJson.code != null && Number(putJson.code) !== 2000)
      ) {
        throw new ArticleApiError(
          "ARTICLE_API_CHANGED",
          "未能确认视频上传结果，请稍后重试",
        );
      }
      meter.finish();
    } else {
      await this.uploadTosParts({
        host,
        oid,
        tosSign,
        path,
        size: info.size,
        partSize: this.tosPartSize,
        onProgress: options?.onProgress,
      });
    }

    const updateQuery = extraParam
      ? `action=UpdateVideoUploadInfos&${extraParam}`
      : "action=UpdateVideoUploadInfos";
    const updateBody = JSON.stringify({
      vid,
      oid,
      token,
      poster_ss: 0,
      is_exact_poster: false,
      user_reference: "",
    });
    const updateRes = await this.transport.request({
      url: `${VAS_ORIGIN}/video/openapi/v1/?${updateQuery}`,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-TT-Access": accessKey,
        Authorization: uploadToken,
      },
      body: Buffer.from(updateBody, "utf8"),
      timeoutMs: this.timeoutMs,
    });
    const updateJson = parseJsonPreservingIds(updateRes.body);
    if (Number(updateJson.code) !== 2000) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频信息，请检查视频后重试",
      );
    }
    const meta = asRecord(updateJson.data);
    const video = asRecord(meta.video);
    const poster = asRecord(meta.poster);
    const duration = Number(video.duration ?? meta.v_duration ?? 0);
    const width = Number(video.width ?? 0);
    const height = Number(video.height ?? 0);
    const coverUri = String(poster.oid ?? "").trim();
    const uri = String(video.oid ?? oid).trim();
    if (!(duration > 0) || !(width > 0) || !(height > 0) || !coverUri || !uri) {
      throw new ArticleApiError(
        "VIDEO_UNSUPPORTED",
        "未能确认视频信息，请检查视频后重试",
      );
    }
    return {
      vid,
      duration,
      width,
      height,
      coverUri,
      uploadResult: { Uri: uri, Vid: vid },
    };
  }
}

/**
 * 生产入口：临时 partition + injectCookies，出站走 session.fetch(credentials:include)。
 * 单测可直接 `new ToutiaoVideoClient(cookies, mockTransport)`。
 */
export async function createToutiaoVideoClient(
  cookies: AgentCookie[],
  timeoutMs = 60_000,
): Promise<ToutiaoVideoClient> {
  const isolated = await createNetworkSession(
    `toutiao-video-${randomUUID()}`,
    { cache: false },
  );
  await injectCookies(isolated, cookies);
  const client = new ToutiaoVideoClient(
    cookies,
    sessionBoundTransport(isolated),
    timeoutMs,
  );
  client.bindSessionCleanup(async () => {
    await isolated.clearStorageData().catch(() => {});
    await isolated.clearCache().catch(() => {});
    await isolated.closeAllConnections().catch(() => {});
  });
  return client;
}
