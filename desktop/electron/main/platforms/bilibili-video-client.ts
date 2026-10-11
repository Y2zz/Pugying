/**
 * B 站短视频 Cookie 直调：member preupload → UPOS stdSlice（?uploads / 分片 PUT /
 * complete）→ cover/up → /x/vu/web/add/v3。
 * 主进程完成，无隐藏窗。
 * preupload 回 601/406 且文案「上传过快」时，detail 常带 v_voucher——实为 Gaia 短信风控，
 * 非单纯频控；映射 PLATFORM_VERIFICATION_REQUIRED，请用户到创作者中心完成验证。
 */
import { open, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { nativeImage } from "electron";
import type { AgentCookie } from "../protocol";
import { platformOutboundFetch } from "../network-policy";
import {
  ArticleApiError,
  articleRecord,
  type UploadedArticleImage,
} from "./article-api";
import {
  findMoovAtomOffset,
  mergeMp4Meta,
  readMp4Meta,
} from "./channels-graphic-client";
import {
  clampUploadConcurrency,
  DEFAULT_UPLOAD_CONCURRENCY,
  mapPool,
} from "./chunk-pool";
import { buildCookieHeader } from "./douyin-http-client";
import { createUploadMeter } from "./upload-progress";
import type {
  UploadedVideo,
  VideoApiSession,
  VideoUploadOptions,
} from "./video-api";

const MEMBER_ORIGIN = "https://member.bilibili.com";
const REFERER = `${MEMBER_ORIGIN}/york/videoup`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
/** 与官方 BUploader 版本一致；profile 用 ugcupos/bup（ugcfx/bup 在 CDN ?uploads 会 400）。 */
const UPOS_VERSION = "4.4.1";
const UPOS_BUILD = "4040100";
const UPOS_PROFILE = "ugcupos/bup";
const DEFAULT_CHUNK_SIZE = 0xa00000;
/** 与官方 preupload 回执 chunk_retry 一致；缺省 10 次、间隔 3 秒 */
const DEFAULT_CHUNK_RETRY = 10;
const DEFAULT_CHUNK_RETRY_DELAY_SEC = 3;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024 * 1024;
const MAX_DURATION_SEC = 36_000;
const MAX_COVER_BYTES = 20 * 1024 * 1024;

export interface BilibiliVideoHttpResponse {
  status: number;
  body: Uint8Array;
  headers: Record<string, string>;
}

export interface BilibiliVideoHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<BilibiliVideoHttpResponse>;
}

const defaultTransport: BilibiliVideoHttpTransport = {
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

function parseJsonPreservingIds(body: Uint8Array): Record<string, unknown> {
  try {
    const text = Buffer.from(body).toString("utf8");
    return asRecord(
      JSON.parse(text, (_key, value, context) => {
        if (
          typeof value === "number" &&
          !Number.isSafeInteger(value) &&
          context &&
          typeof (context as { source?: string }).source === "string"
        ) {
          return (context as { source: string }).source;
        }
        return value;
      }),
    );
  } catch {
    return {};
  }
}

function buildQuery(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}

function sleep(ms: number): Promise<void> {
  if (!(ms > 0)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseChunkRetry(preJson: Record<string, unknown>): {
  retries: number;
  delayMs: number;
} {
  const retriesRaw = Number(preJson.chunk_retry);
  const retries =
    Number.isFinite(retriesRaw) && retriesRaw > 0
      ? Math.min(20, Math.floor(retriesRaw))
      : DEFAULT_CHUNK_RETRY;
  const delayRaw = Number(preJson.chunk_retry_delay);
  const delayMs =
    Number.isFinite(delayRaw) && delayRaw >= 0
      ? Math.floor(delayRaw * 1000)
      : DEFAULT_CHUNK_RETRY_DELAY_SEC * 1000;
  return { retries, delayMs };
}

function isTransientUposStatus(status: number): boolean {
  // CDN InternalError「Try again」、网关 999 等瞬时失败，按官方 chunk_retry 再传
  return status >= 500 || status === 429;
}

function buildMultipart(
  fields: Array<{
    name: string;
    value: string | Buffer;
    fileName?: string;
    mime?: string;
  }>,
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
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"; filename="${field.fileName || "cover.jpg"}"\r\nContent-Type: ${field.mime || "application/octet-stream"}\r\n\r\n`,
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

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/** upos://host/path → https://endpoint/path（endpoint 已含 host） */
function uposHttpUrl(uposUri: string, endpoint: string): string {
  const path = uposUri.replace(/^upos:\/\//, "");
  const base = normalizeEndpoint(endpoint).replace(/\/+$/, "");
  // upos_uri 含 host/key；官方用 endpoint + "/" + uri 去掉 upos:// 后整段
  return `${base}/${path}`;
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

/** 头尾分段读 moov，对齐其它平台短视频元数据探测。 */
async function readLocalVideoMeta(path: string): Promise<{
  width: number;
  height: number;
  duration: number;
}> {
  const info = await stat(path);
  const headLen = Math.min(info.size, 2 * 1024 * 1024);
  const tailLen = Math.min(info.size, 4 * 1024 * 1024);
  const fh = await open(path, "r");
  try {
    const headBuf = Buffer.alloc(headLen);
    await fh.read(headBuf, 0, headLen, 0);
    const tailBuf = Buffer.alloc(tailLen);
    await fh.read(tailBuf, 0, tailLen, Math.max(0, info.size - tailLen));
    const headMeta = readMp4Meta(headBuf);
    const moovAt = findMoovAtomOffset(tailBuf);
    const tailMeta = readMp4Meta(
      moovAt >= 0 ? tailBuf.subarray(moovAt) : tailBuf,
    );
    const meta = mergeMp4Meta([headMeta, tailMeta]);
    return {
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
    };
  } finally {
    await fh.close();
  }
}

/** preupload 风控：平台文案像频控，但带 v_voucher / 601 时需短信等验证。 */
function isPreuploadVerificationRequired(
  json: Record<string, unknown>,
): boolean {
  const message = String(json.message ?? json.info ?? "");
  const detail = articleRecord(json.detail);
  const voucher = String(detail.v_voucher ?? json.v_voucher ?? "").trim();
  return (
    Boolean(voucher) ||
    Number(json.code) === 601 ||
    /上传过快|稍作休息/.test(message)
  );
}

export class BilibiliVideoClient implements VideoApiSession {
  private readonly cookieHeader: string;
  private readonly csrf: string;
  private disposed = false;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: BilibiliVideoHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
    this.csrf =
      cookies.find((cookie) => cookie.name === "bili_jct")?.value?.trim() ??
      "";
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new ArticleApiError("cancelled", "发布已取消");
    }
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

  private async rawRequest(
    method: string,
    url: string,
    body?: Uint8Array,
    extraHeaders?: Record<string, string>,
    timeoutMs = this.timeoutMs,
  ): Promise<BilibiliVideoHttpResponse> {
    this.assertOpen();
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    try {
      return await this.transport.request({
        url,
        method,
        headers: this.baseHeaders(extraHeaders),
        body,
        timeoutMs,
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
  }

  /**
   * 表单侧与投稿共用：GET archive/pre；POST add/v3（csrf 进 query + body）。
   */
  async request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (path === "/x/vupre/web/archive/pre" && data === undefined) {
      const response = await this.rawRequest(
        "GET",
        `${MEMBER_ORIGIN}/x/vupre/web/archive/pre?lang=cn`,
      );
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
    if (path === "/x/vu/web/add/v3" && data !== undefined) {
      if (!this.csrf) {
        throw new ArticleApiError(
          "AUTH_EXPIRED",
          "账号登录已失效，请重新授权",
        );
      }
      // 与官方 interceptor 一致：query 与 JSON body 均带 csrf。
      const query = buildQuery({
        web_location: "333.1024",
        t: Date.now(),
        csrf: this.csrf,
      });
      const payload = { ...data, csrf: this.csrf };
      const response = await this.rawRequest(
        "POST",
        `${MEMBER_ORIGIN}/x/vu/web/add/v3?${query}`,
        Buffer.from(JSON.stringify(payload), "utf8"),
        { "Content-Type": "application/json" },
        30_000,
      );
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
    throw new ArticleApiError(
      "invalid_payload",
      "暂时无法自动发布，请稍后重试",
    );
  }

  /** 官方 cover 字段为 data URL 文本；同步写入 csrf 字段与 query。 */
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
    if (info.size > MAX_COVER_BYTES) {
      throw new ArticleApiError(
        "ARTICLE_IMAGE_UNSUPPORTED",
        "图片不能超过 20MB",
      );
    }
    const bytes = await readFile(path);
    const mime = imageMime(bytes);
    // 封面投稿只依赖 data URL；宽高仅回填 UploadedArticleImage。
    // nativeImage 在无 Electron 的 live 测试里可能 getSize=0，mime 已通过时降级占位。
    const image = nativeImage.createFromBuffer(bytes);
    const measured = image.getSize();
    const width = measured.width > 0 ? measured.width : 1;
    const height = measured.height > 0 ? measured.height : 1;
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    const multipart = buildMultipart([
      { name: "cover", value: dataUrl },
      { name: "csrf", value: this.csrf },
    ]);
    const query = buildQuery({ csrf: this.csrf });
    const response = await this.rawRequest(
      "POST",
      `${MEMBER_ORIGIN}/x/vu/web/cover/up?${query}`,
      multipart.body,
      { "Content-Type": multipart.contentType },
      180_000,
    );
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
    if (Number(json.code) === -101) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    if (Number(json.code) !== 0) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认封面上传结果，请稍后重试",
      );
    }
    const data = articleRecord(json.data);
    const url = String(data.url ?? "")
      .trim()
      .replace(/^http:/, "https:");
    if (!/^https:\/\//.test(url)) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认封面上传结果，请稍后重试",
      );
    }
    return {
      uri: url,
      url,
      width,
      height,
      size: bytes.length / 1024,
    };
  }

  /**
   * UPOS stdSlice：preupload → POST ?uploads → 分片 PUT → POST complete。
   * 回执 cid=biz_id、filename=upos_uri 末段去扩展名。
   */
  async uploadVideo(
    path: string,
    options?: VideoUploadOptions,
  ): Promise<UploadedVideo> {
    this.assertOpen();
    if (!isAbsolute(path)) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile() || !(info.size > 0)) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
    }
    if (info.size > MAX_VIDEO_BYTES) {
      throw new ArticleApiError(
        "VIDEO_UNSUPPORTED",
        "视频超过平台限制，请重新选择",
      );
    }
    const meta = await readLocalVideoMeta(path);
    if (
      !(meta.duration > 0) ||
      meta.duration > MAX_DURATION_SEC ||
      !(meta.width > 0) ||
      !(meta.height > 0)
    ) {
      throw new ArticleApiError(
        "VIDEO_UNSUPPORTED",
        "视频格式不受支持，请重新选择",
      );
    }
    const fileName = basename(path) || "video.mp4";
    const preQuery = buildQuery({
      name: fileName,
      size: info.size,
      r: "upos",
      profile: UPOS_PROFILE,
      ssl: 0,
      version: UPOS_VERSION,
      build: UPOS_BUILD,
    });
    const preResponse = await this.rawRequest(
      "GET",
      `${MEMBER_ORIGIN}/preupload?${preQuery}`,
      undefined,
      undefined,
      60_000,
    );
    const preJson = parseJsonPreservingIds(preResponse.body);
    // HTTP 406 + code 601「上传过快」+ v_voucher：短信/Gaia 验证，不是可稍后重试的频控。
    if (isPreuploadVerificationRequired(preJson)) {
      throw new ArticleApiError(
        "PLATFORM_VERIFICATION_REQUIRED",
        "平台需要验证，请到创作者中心完成后再发布",
        {
          code: Number(preJson.code),
          message: String(preJson.message ?? preJson.info ?? "").slice(0, 200),
          voucher: String(
            articleRecord(preJson.detail).v_voucher ?? "",
          ).slice(0, 80),
        },
      );
    }
    if (
      preResponse.status < 200 ||
      preResponse.status >= 300 ||
      (preJson.OK != null && Number(preJson.OK) === 0 && !preJson.upos_uri)
    ) {
      throw new ArticleApiError(
        "VIDEO_UPLOAD_FAILED",
        "视频上传失败，请稍后重试",
        {
          stage: "preupload",
          status: preResponse.status,
          code: Number(preJson.code),
        },
      );
    }
    const auth = String(preJson.auth ?? "").trim();
    const uposUri = String(preJson.upos_uri ?? "").trim();
    const bizId = String(preJson.biz_id ?? "").trim();
    const endpoints = Array.isArray(preJson.endpoints)
      ? preJson.endpoints.map(String).filter(Boolean)
      : [];
    const endpoint = String(
      endpoints[0] ?? preJson.endpoint ?? "",
    ).trim();
    // preupload 下发的 put_query（os/profile）须拼到 CDN ?uploads / 分片 PUT。
    const putQuery = String(preJson.put_query ?? "").trim() ||
      `os=upos&profile=${encodeURIComponent(UPOS_PROFILE)}`;
    if (
      !auth ||
      !uposUri.startsWith("upos://") ||
      !/^[1-9]\d*$/.test(bizId) ||
      !endpoint
    ) {
      throw new ArticleApiError(
        "VIDEO_UPLOAD_FAILED",
        "视频上传失败，请稍后重试",
        { stage: "preupload_fields" },
      );
    }
    const biliFilename = uposUri
      .split(/[/\\]/)
      .pop()!
      .split(".")[0];
    if (!biliFilename) {
      throw new ArticleApiError(
        "VIDEO_UPLOAD_FAILED",
        "视频上传失败，请稍后重试",
      );
    }
    const chunkSize =
      Number(preJson.chunk_size) > 0
        ? Number(preJson.chunk_size)
        : DEFAULT_CHUNK_SIZE;
    // 优先 preupload.threads；缺省用统一并发（部分线路上限约 8）
    const uploadThreads = clampUploadConcurrency(
      preJson.threads,
      DEFAULT_UPLOAD_CONCURRENCY,
    );
    const { retries: chunkRetry, delayMs: chunkRetryDelayMs } =
      parseChunkRetry(preJson);
    const objectUrl = uposHttpUrl(uposUri, endpoint);

    // CDN 请求只带 UA + X-Upos-Auth，避免 Cookie/Origin 干扰分片初始化。
    const cdnHeaders = {
      Accept: "*/*",
      "User-Agent": USER_AGENT,
      "X-Upos-Auth": auth,
    };
    const initResponse = await this.transport.request({
      url: `${objectUrl}?uploads&output=json&${putQuery}`,
      method: "POST",
      headers: cdnHeaders,
      timeoutMs: 60_000,
    });
    const initJson = parseJsonPreservingIds(initResponse.body);
    const uploadId = String(
      initJson.upload_id ?? initJson.uploadId ?? "",
    ).trim();
    if (
      initResponse.status < 200 ||
      initResponse.status >= 300 ||
      !uploadId
    ) {
      throw new ArticleApiError(
        "VIDEO_UPLOAD_FAILED",
        "视频上传失败，请稍后重试",
        { stage: "uploads_init", status: initResponse.status },
      );
    }

    const chunkTotal = Math.ceil(info.size / chunkSize);
    const meter = createUploadMeter(info.size, options?.onProgress);
    meter.start();
    // 每路单独 open：Node 禁止同一 FileHandle 并发 read
    await mapPool(chunkTotal, uploadThreads, async (index) => {
      this.assertOpen();
      const start = index * chunkSize;
      const end = Math.min(start + chunkSize, info.size);
      const size = end - start;
      const buf = Buffer.alloc(size);
      const file = await open(path, "r");
      try {
        await file.read(buf, 0, size, start);
      } finally {
        await file.close();
      }
      const partQuery = buildQuery({
        partNumber: index + 1,
        uploadId,
        chunk: index,
        chunks: chunkTotal,
        size,
        start,
        end,
        total: info.size,
        output: "json",
      });
      // CDN 分片不走 rawRequest（无 Cookie）；Uint8Array 避免 Buffer 经代理时异常中断。
      // 官方 chunk_retry：5xx / 传输中断可重试，勿把瞬时 500 直接记成连接失败。
      const partBody = new Uint8Array(
        buf.buffer,
        buf.byteOffset,
        buf.byteLength,
      );
      for (let attempt = 0; attempt <= chunkRetry; attempt++) {
        this.assertOpen();
        let putResponse: BilibiliVideoHttpResponse;
        try {
          putResponse = await this.transport.request({
            url: `${objectUrl}?${partQuery}&${putQuery}`,
            method: "PUT",
            headers: {
              ...cdnHeaders,
              "Content-Type": "application/octet-stream",
            },
            body: partBody,
            timeoutMs: 180_000,
          });
        } catch (error) {
          if (error instanceof ArticleApiError) {
            throw error;
          }
          const timedOut =
            error instanceof Error &&
            (error.name === "AbortError" ||
              /aborted|timeout/i.test(error.message));
          if (attempt < chunkRetry) {
            await sleep(chunkRetryDelayMs);
            continue;
          }
          throw new ArticleApiError(
            timedOut ? "HTTP_TIMEOUT" : "HTTP_REQUEST_FAILED",
            "暂时无法连接发布平台",
            { stage: "part_put", part: index + 1 },
          );
        }
        if (putResponse.status >= 200 && putResponse.status < 300) {
          meter.add(size);
          break;
        }
        if (
          isTransientUposStatus(putResponse.status) &&
          attempt < chunkRetry
        ) {
          await sleep(chunkRetryDelayMs);
          continue;
        }
        throw new ArticleApiError(
          "VIDEO_UPLOAD_FAILED",
          "视频上传失败，请稍后重试",
          { stage: "part_put", part: index + 1, status: putResponse.status },
        );
      }
    });
    meter.finish();
    // UPOS stdSlice 合片固定 eTag 字面量 "etag"（非响应头 ETag）。
    const parts = Array.from({ length: chunkTotal }, (_, index) => ({
      partNumber: index + 1,
      eTag: "etag",
    }));
    const completeQuery = buildQuery({
      output: "json",
      name: fileName,
      profile: UPOS_PROFILE,
      uploadId,
      biz_id: bizId,
    });
    let completeResponse: BilibiliVideoHttpResponse;
    try {
      completeResponse = await this.transport.request({
        url: `${objectUrl}?${completeQuery}`,
        method: "POST",
        headers: {
          ...cdnHeaders,
          "Content-Type": "application/json",
        },
        body: Buffer.from(JSON.stringify({ parts }), "utf8"),
        timeoutMs: 120_000,
      });
    } catch (error) {
      if (error instanceof ArticleApiError) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === "AbortError" ||
          /aborted|timeout/i.test(error.message))
      ) {
        throw new ArticleApiError(
          "HTTP_TIMEOUT",
          "暂时无法连接发布平台",
          { stage: "complete" },
        );
      }
      throw new ArticleApiError(
        "HTTP_REQUEST_FAILED",
        "暂时无法连接发布平台",
        { stage: "complete" },
      );
    }
    if (
      completeResponse.status < 200 ||
      completeResponse.status >= 300
    ) {
      throw new ArticleApiError(
        "VIDEO_UPLOAD_FAILED",
        "视频上传失败，请稍后重试",
        { stage: "complete", status: completeResponse.status },
      );
    }

    return {
      vid: bizId,
      fileId: biliFilename,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      coverUri: "",
    };
  }
}
