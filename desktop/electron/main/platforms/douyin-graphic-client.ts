/**
 * 抖音创作者 Cookie 直调：auth/v5 → ImageX/VOD 上传 → create_v2。
 * 图文 / 文章 / 短视频共用；创作者读/写经主进程官方 bdms 签名，上传链 STS + AWS4（无隐藏窗）。
 */
import { open, readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { crc32 } from "node:zlib";
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
import {
  DouyinBdmsSignError,
  signDouyinCreatorUrl,
} from "./douyin-bdms-sign";
import {
  buildImagexQuery,
  randomImagexSalt,
  signImagexGetAuthorization,
  signImagexPostAuthorization,
  signVodGetAuthorization,
  signVodPostAuthorization,
  type DouyinImagexSts,
} from "./douyin-imagex-aws4";
import {
  parseDouyinTopicSuggestions,
  type PlatformResourceRef,
} from "@shared/platform-resource";
import { clampUploadConcurrency, mapPool } from "./chunk-pool";
import { createUploadMeter } from "./upload-progress";
import type {
  UploadedVideo,
  VideoUploadOptions,
  VideoUploadProgress,
} from "./video-api";

const CREATOR_ORIGIN = "https://creator.douyin.com";
const IMAGEX_ORIGIN = "https://imagex.bytedanceapi.com";
const VOD_ORIGIN = "https://vod.bytedanceapi.com";
/** 创作者图文 ImageX ServiceId（与官方 Uploader type=image 一致） */
const IMAGE_SERVICE_ID = "jm8ajry58r";
/** 创作者视频 VOD SpaceName（与官方 Uploader type=video 一致） */
const VOD_SPACE_NAME = "aweme";
/** 创作者页视频分片 10MB；不超过此大小仍走 serial 整文件 POST */
const VOD_PART_SIZE = 10 * 1024 * 1024;
/** 这次创作者页同时在传约 6 片，与浏览器对同一主机的连接数一致 */
const VOD_PART_CONCURRENCY = 6;
const VOD_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const REFERER = `${CREATOR_ORIGIN}/creator-micro/content/post/image`;
const CREATE_V2_PATH =
  "/web/api/media/aweme/create_v2/?read_aid=2906&aid=2906&device_platform=web";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
/** 官方创作者视频上限；整文件上传需读入内存，超大文件后续再对齐分片协议 */
const MAX_VIDEO_BYTES = 16 * 1024 * 1024 * 1024;
const VIDEO_TRANSEND_TIMEOUT_MS = 15 * 60 * 1000;
const VIDEO_TRANSEND_POLL_MS = 1000;
export interface DouyinGraphicHttpResponse {
  status: number;
  body: Uint8Array;
}

export interface DouyinGraphicHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<DouyinGraphicHttpResponse>;
}

const defaultTransport: DouyinGraphicHttpTransport = {
  async request(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);
    try {
      const response = await platformOutboundFetch(options.url, {
        method: options.method,
        headers: options.headers,
        // Electron fetch 的 BodyInit 与 TS DOM Uint8Array 泛型偶有不兼容
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

function parseJson(body: Uint8Array): Record<string, unknown> {
  try {
    const text = Buffer.from(body).toString("utf8");
    const parsed = JSON.parse(text) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function crc32Hex(bytes: Buffer): string {
  // Node zlib.crc32；与官方 Uploader Content-CRC32 一致
  return (crc32(bytes) >>> 0).toString(16).padStart(8, "0");
}

/** auth/v5 的 STS2 PolicyString.Condition.UserId，申请边缘上传地址时要带上。 */
function douyinStsUserId(sessionToken: string): string {
  try {
    const raw = sessionToken.startsWith("STS2")
      ? sessionToken.slice(4)
      : sessionToken;
    const decoded = asRecord(
      JSON.parse(Buffer.from(raw, "base64").toString("utf8")),
    );
    const policy = asRecord(
      typeof decoded.PolicyString === "string"
        ? JSON.parse(decoded.PolicyString)
        : decoded.PolicyString,
    );
    const statements = Array.isArray(policy.Statement) ? policy.Statement : [];
    const conditionRaw = asRecord(statements[0]).Condition;
    const condition = asRecord(
      typeof conditionRaw === "string" ? JSON.parse(conditionRaw) : conditionRaw,
    );
    return String(condition.UserId ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * 10MB 一片。文件不能被整除时，余数并进上一片（最后一片在 10MB 到将近 20MB）。
 * 与创作者页 874MB 实抓一致：86×10MB + 最后一片约 13.9MB。
 */
function douyinVodPartRanges(
  size: number,
  partSize: number,
): Array<{ offset: number; length: number }> {
  if (size <= 0 || partSize <= 0 || size <= partSize) {
    return [{ offset: 0, length: Math.max(size, 0) }];
  }
  const full = Math.floor(size / partSize);
  const ranges: Array<{ offset: number; length: number }> = [];
  for (let index = 0; index < full - 1; index += 1) {
    ranges.push({ offset: index * partSize, length: partSize });
  }
  const offset = (full - 1) * partSize;
  ranges.push({ offset, length: size - offset });
  return ranges;
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

export class DouyinGraphicClient {
  private readonly cookieHeader: string;
  private sts: DouyinImagexSts | null = null;
  private disposed = false;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: DouyinGraphicHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
    private readonly signUrl: (
      pathOrUrl: string,
    ) => Promise<string> = signDouyinCreatorUrl,
    private readonly vodPartSize = VOD_PART_SIZE,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
  }

  async prepare(): Promise<void> {
    this.assertOpen();
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const auth = await this.creatorJsonGet(
      "/web/api/media/upload/auth/v5/",
    );
    if (Number(auth.status_code) !== 0) {
      if (Number(auth.status_code) === 8) {
        throw new ArticleApiError(
          "AUTH_EXPIRED",
          "账号登录已失效，请重新授权",
        );
      }
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法自动发布，请稍后重试",
      );
    }
    const nested = asRecord(
      typeof auth.auth === "string"
        ? (() => {
            try {
              return JSON.parse(auth.auth) as unknown;
            } catch {
              return {};
            }
          })()
        : auth.auth,
    );
    const accessKeyId = String(
      nested.AccessKeyID ?? nested.accessKeyId ?? "",
    ).trim();
    const secretAccessKey = String(
      nested.SecretAccessKey ?? nested.secretAccessKey ?? "",
    ).trim();
    const sessionToken = String(
      nested.SessionToken ?? nested.sessionToken ?? "",
    ).trim();
    if (!accessKeyId || !secretAccessKey || !sessionToken) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法自动发布，请稍后重试",
      );
    }
    this.sts = { accessKeyId, secretAccessKey, sessionToken };
  }

  async uploadImage(path: string): Promise<UploadedArticleImage> {
    this.assertOpen();
    if (!this.sts) {
      await this.prepare();
    }
    const sts = this.sts!;
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
    if (mime === "image/gif") {
      throw new ArticleApiError(
        "ARTICLE_IMAGE_UNSUPPORTED",
        "该平台需要 JPEG 或 PNG 图片，请重新选择",
      );
    }
    const image = nativeImage.createFromBuffer(bytes);
    const size = image.getSize();
    if (!(size.width > 0) || !(size.height > 0)) {
      throw new ArticleApiError(
        "ARTICLE_IMAGE_UNSUPPORTED",
        "请使用 JPEG、PNG 或平台支持的图片格式",
      );
    }

    const applyQuery = buildImagexQuery({
      Action: "ApplyImageUpload",
      Version: "2018-08-01",
      ServiceId: IMAGE_SERVICE_ID,
      app_id: "2906",
      user_id: "",
      s: randomImagexSalt(),
    });
    const applyAuth = signImagexGetAuthorization(sts, applyQuery);
    const applyRes = await this.transport.request({
      url: `${IMAGEX_ORIGIN}/?${applyQuery}`,
      method: "GET",
      headers: {
        Accept: "*/*",
        Authorization: applyAuth.authorization,
        "x-amz-date": applyAuth.amzDate,
        "x-amz-security-token": sts.sessionToken,
        "User-Agent": USER_AGENT,
      },
      timeoutMs: this.timeoutMs,
    });
    const applyJson = parseJson(applyRes.body);
    const applyError = asRecord(
      asRecord(applyJson.ResponseMetadata).Error,
    );
    if (applyError.Code || applyJson.Result == null) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }
    const uploadAddress = asRecord(
      asRecord(applyJson.Result).UploadAddress,
    );
    const storeInfos = Array.isArray(uploadAddress.StoreInfos)
      ? uploadAddress.StoreInfos
      : [];
    const store = asRecord(storeInfos[0]);
    const uploadHosts = Array.isArray(uploadAddress.UploadHosts)
      ? uploadAddress.UploadHosts.map(String)
      : [];
    const storeUri = String(store.StoreUri ?? "").trim();
    const auth = String(store.Auth ?? "").trim();
    const host =
      String(store.UploadHost ?? "").trim() ||
      String(uploadHosts[0] ?? "").trim();
    if (!storeUri || !auth || !host) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }

    // 官方 Uploader：主机 + /upload/v1/{StoreUri}，Auth 头 + Content-CRC32
    const uploadUrl = `https://${host}/upload/v1/${storeUri}`;
    const crc = crc32Hex(bytes);
    const putRes = await this.transport.request({
      url: uploadUrl,
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-CRC32": crc,
        "Content-Type": "application/octet-stream",
        "User-Agent": USER_AGENT,
      },
      body: bytes,
      timeoutMs: this.timeoutMs,
    });
    const putJson = parseJson(putRes.body);
    if (
      putRes.status >= 300 ||
      (putJson.code != null && Number(putJson.code) !== 2000)
    ) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }

    const sessionKey = String(
      asRecord(uploadAddress).SessionKey ?? storeUri,
    ).trim();
    const commitPayload = JSON.stringify({ SessionKey: sessionKey });
    const commitQuery = buildImagexQuery({
      Action: "CommitImageUpload",
      Version: "2018-08-01",
      ServiceId: IMAGE_SERVICE_ID,
    });
    const commitAuth = signImagexPostAuthorization(
      sts,
      commitQuery,
      commitPayload,
    );
    await this.transport.request({
      url: `${IMAGEX_ORIGIN}/?${commitQuery}`,
      method: "POST",
      headers: {
        Accept: "*/*",
        Authorization: commitAuth.authorization,
        "Content-Type": "application/json",
        "x-amz-date": commitAuth.amzDate,
        "x-amz-security-token": sts.sessionToken,
        "User-Agent": USER_AGENT,
      },
      body: Buffer.from(commitPayload, "utf8"),
      timeoutMs: this.timeoutMs,
    });

    return {
      uri: storeUri,
      url: `https://${host}/${storeUri}`,
      width: size.width,
      height: size.height,
      size: bytes.length / 1024,
    };
  }

  /**
   * TOS edge 分片：init → transfer（每片 Content-CRC32）→ finish。
   * 与官方 Uploader / 头条同一套 `/upload/v1` 协议；Auth 用 Apply 回执，不再整文件读入内存。
   */
  private async uploadVodParts(options: {
    host: string;
    storeUri: string;
    auth: string;
    storageUser: string;
    path: string;
    size: number;
    onProgress?: (progress: VideoUploadProgress) => void;
  }): Promise<void> {
    const { host, storeUri, auth, storageUser, path, size, onProgress } =
      options;
    const objectUrl = `https://${host}/upload/v1/${storeUri}`;
    const partTimeout = Math.max(this.timeoutMs, VOD_UPLOAD_TIMEOUT_MS);
    const authHeaders: Record<string, string> = {
      Authorization: auth,
      "User-Agent": USER_AGENT,
      "X-Storage-Mode": "gateway",
    };
    if (storageUser) {
      authHeaders["X-Storage-U"] = storageUser;
    }
    const initRes = await this.transport.request({
      url: `${objectUrl}?uploadmode=part&phase=init`,
      method: "POST",
      headers: authHeaders,
      timeoutMs: this.timeoutMs,
    });
    const initJson = parseJson(initRes.body);
    const uploadId = String(
      asRecord(initJson.data).uploadid ??
        asRecord(initJson.data).uploadId ??
        "",
    ).trim();
    if (Number(initJson.code) !== 2000 || !uploadId) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }

    const ranges = douyinVodPartRanges(size, this.vodPartSize);
    const crcParts = new Array<string>(ranges.length);
    const meter = createUploadMeter(size, onProgress);
    meter.start();
    const concurrency = clampUploadConcurrency(
      VOD_PART_CONCURRENCY,
      VOD_PART_CONCURRENCY,
    );
    await mapPool(ranges.length, concurrency, async (index) => {
      this.assertOpen();
      const offset = ranges[index]!.offset;
      const length = ranges[index]!.length;
      const buf = Buffer.alloc(length);
      const file = await open(path, "r");
      try {
        await file.read(buf, 0, length, offset);
      } finally {
        await file.close();
      }
      const crc = crc32Hex(buf);
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
      const transferJson = parseJson(transferRes.body);
      const remoteCrc = String(asRecord(transferJson.data).crc32 ?? "").trim();
      if (
        transferRes.status >= 300 ||
        Number(transferJson.code) !== 2000 ||
        (remoteCrc && remoteCrc.toLowerCase() !== crc.toLowerCase())
      ) {
        throw new ArticleApiError(
          "ARTICLE_API_CHANGED",
          "未能确认视频上传结果，请稍后重试",
        );
      }
      crcParts[index] = `${partNumber}:${crc}`;
      meter.add(length);
    });

    const finishRes = await this.transport.request({
      url:
        `${objectUrl}?uploadid=${encodeURIComponent(uploadId)}` +
        `&phase=finish&uploadmode=part`,
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: Buffer.from(crcParts.join(","), "utf8"),
      timeoutMs: this.timeoutMs,
    });
    const finishJson = parseJson(finishRes.body);
    if (finishRes.status >= 300 || Number(finishJson.code) !== 2000) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }
    meter.finish();
  }

  /**
   * 视频：ApplyUploadInner → TOS 上传 → CommitUploadInner →
   * enable/transend 等到 encode=1 与宽高时长封面。
   * 超过分片阈值走 part；小文件仍 serial 整文件（Content-CRC32）。
   */
  async uploadVideo(
    path: string,
    options?: VideoUploadOptions,
  ): Promise<UploadedVideo> {
    this.assertOpen();
    if (!this.sts) {
      await this.prepare();
    }
    const sts = this.sts!;
    if (!isAbsolute(path)) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
    }
    if (info.size <= 0 || info.size > MAX_VIDEO_BYTES) {
      throw new ArticleApiError(
        "VIDEO_UNSUPPORTED",
        "请检查视频后重试",
      );
    }
    const applyQuery = buildImagexQuery({
      Action: "ApplyUploadInner",
      FileSize: String(info.size),
      FileType: "video",
      IsInner: "1",
      SpaceName: VOD_SPACE_NAME,
      Version: "2020-11-19",
      app_id: "2906",
      s: randomImagexSalt(),
      user_id: douyinStsUserId(sts.sessionToken),
    });
    const applyAuth = signVodGetAuthorization(sts, applyQuery);
    const applyRes = await this.transport.request({
      url: `${VOD_ORIGIN}/?${applyQuery}`,
      method: "GET",
      headers: {
        Accept: "*/*",
        Authorization: applyAuth.authorization,
        "x-amz-date": applyAuth.amzDate,
        "x-amz-security-token": sts.sessionToken,
        "User-Agent": USER_AGENT,
      },
      timeoutMs: this.timeoutMs,
    });
    const applyJson = parseJson(applyRes.body);
    const applyError = asRecord(
      asRecord(applyJson.ResponseMetadata).Error,
    );
    if (applyError.Code || applyJson.Result == null) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }
    const inner = asRecord(
      asRecord(applyJson.Result).InnerUploadAddress,
    );
    const nodes = Array.isArray(inner.UploadNodes) ? inner.UploadNodes : [];
    const node = asRecord(nodes[0]);
    const storeInfos = Array.isArray(node.StoreInfos) ? node.StoreInfos : [];
    const store = asRecord(storeInfos[0]);
    const applyVid = String(node.Vid ?? "").trim();
    const storeUri = String(store.StoreUri ?? "").trim();
    const auth = String(store.Auth ?? "").trim();
    const host = String(node.UploadHost ?? "").trim();
    const sessionKey = String(node.SessionKey ?? "").trim();
    const storageUser =
      String(asRecord(store.StorageHeader).USER_ID ?? "").trim() ||
      douyinStsUserId(sts.sessionToken);
    if (!applyVid || !storeUri || !auth || !host || !sessionKey) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }

    if (info.size <= this.vodPartSize) {
      const bytes = await readFile(path);
      const meter = createUploadMeter(bytes.length, options?.onProgress);
      meter.start();
      const serialHeaders: Record<string, string> = {
        Authorization: auth,
        "Content-CRC32": crc32Hex(bytes),
        "Content-Type": "application/octet-stream",
        "User-Agent": USER_AGENT,
      };
      if (storageUser) {
        serialHeaders["X-Storage-Mode"] = "gateway";
        serialHeaders["X-Storage-U"] = storageUser;
      }
      const putRes = await this.transport.request({
        url: `https://${host}/upload/v1/${storeUri}`,
        method: "POST",
        headers: serialHeaders,
        body: bytes,
        timeoutMs: Math.max(this.timeoutMs, VOD_UPLOAD_TIMEOUT_MS),
      });
      const putJson = parseJson(putRes.body);
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
      await this.uploadVodParts({
        host,
        storeUri,
        auth,
        storageUser,
        path,
        size: info.size,
        onProgress: options?.onProgress,
      });
    }

    const commitPayload = JSON.stringify({ SessionKey: sessionKey });
    const commitQuery = buildImagexQuery({
      Action: "CommitUploadInner",
      SpaceName: VOD_SPACE_NAME,
      Version: "2020-11-19",
    });
    const commitAuth = signVodPostAuthorization(sts, commitQuery, commitPayload);
    const commitRes = await this.transport.request({
      url: `${VOD_ORIGIN}/?${commitQuery}`,
      method: "POST",
      headers: {
        Accept: "*/*",
        Authorization: commitAuth.authorization,
        "Content-Type": "application/json",
        "x-amz-date": commitAuth.amzDate,
        "x-amz-security-token": sts.sessionToken,
        "User-Agent": USER_AGENT,
      },
      body: Buffer.from(commitPayload, "utf8"),
      timeoutMs: this.timeoutMs,
    });
    const commitJson = parseJson(commitRes.body);
    const commitError = asRecord(
      asRecord(commitJson.ResponseMetadata).Error,
    );
    if (commitError.Code) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }
    const commitResults = Array.isArray(asRecord(commitJson.Result).Results)
      ? (asRecord(commitJson.Result).Results as unknown[])
      : [];
    const commitVid = String(
      asRecord(commitResults[0]).Vid ?? "",
    ).trim();
    // Commit 可能改写 Vid；优先用 Commit，回退 Apply
    const vid = commitVid || applyVid;

    const enabled = await this.creatorJsonGet(
      `/web/api/media/video/enable/?video_id=${encodeURIComponent(vid)}`,
    );
    if (Number(enabled.status_code) !== 0) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频信息，请检查视频后重试",
      );
    }

    const deadline = Date.now() + VIDEO_TRANSEND_TIMEOUT_MS;
    while (Date.now() < deadline) {
      this.assertOpen();
      const meta = await this.creatorJsonGet(
        `/web/api/media/video/transend/?video_id=${encodeURIComponent(vid)}`,
      );
      if (Number(meta.status_code) !== 0) {
        throw new ArticleApiError(
          "ARTICLE_API_CHANGED",
          "未能确认视频信息，请检查视频后重试",
        );
      }
      const duration = Number(meta.duration);
      const width = Number(meta.width);
      const height = Number(meta.height);
      const coverUri = String(meta.poster_uri ?? "").trim();
      if (
        Number(meta.encode) === 1 &&
        duration > 0 &&
        width > 0 &&
        height > 0 &&
        coverUri
      ) {
        return { vid, duration, width, height, coverUri };
      }
      await new Promise((resolve) => {
        setTimeout(resolve, VIDEO_TRANSEND_POLL_MS);
      });
    }
    throw new ArticleApiError(
      "VIDEO_PROCESSING_TIMEOUT",
      "视频处理超时，请稍后重试",
    );
  }

  async createAweme(
    item: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertOpen();
    return this.creatorJsonPost(CREATE_V2_PATH, { item });
  }

  /**
   * 兼容 ArticleApiSession.request：无 body 为 GET，有 body 为 POST。
   * create_v2 无查询串时自动补齐官方 aid 参数。
   */
  async request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertOpen();
    if (data === undefined) {
      return this.creatorJsonGet(path);
    }
    const postPath =
      path === "/web/api/media/aweme/create_v2/" ||
      path === "/web/api/media/aweme/create_v2"
        ? CREATE_V2_PATH
        : path;
    return this.creatorJsonPost(postPath, data);
  }

  async searchTopics(keyword: string): Promise<PlatformResourceRef[]> {
    this.assertOpen();
    const params = new URLSearchParams({
      keyword,
      source: "challenge_create",
      aid: "2906",
    });
    const response = await this.creatorJsonGet(
      `/aweme/v1/search/challengesug/?${params}`,
    );
    if (Number(response.status_code) !== 0) {
      return [];
    }
    return parseDouyinTopicSuggestions(response);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.sts = null;
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new ArticleApiError("cancelled", "发布已取消");
    }
  }

  private async creatorJsonGet(
    pathWithQuery: string,
  ): Promise<Record<string, unknown>> {
    return this.creatorRequest("GET", pathWithQuery);
  }

  private async creatorJsonPost(
    pathWithQuery: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.creatorRequest("POST", pathWithQuery, data);
  }

  private async creatorRequest(
    method: "GET" | "POST",
    pathWithQuery: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let signedUrl: string;
    try {
      signedUrl = await this.signUrl(pathWithQuery);
    } catch (error) {
      if (error instanceof DouyinBdmsSignError) {
        throw new ArticleApiError(error.code, error.message);
      }
      throw error;
    }
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      Cookie: this.cookieHeader,
      Origin: CREATOR_ORIGIN,
      Referer: REFERER,
      "User-Agent": USER_AGENT,
    };
    let body: Uint8Array | undefined;
    if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      body = Buffer.from(JSON.stringify(data), "utf8");
    }
    let response: DouyinGraphicHttpResponse;
    try {
      response = await this.transport.request({
        url: signedUrl,
        method,
        headers,
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
    // 仅 401 视为登录失效。403 常见于提交作品被风控拦下（空正文），
    // 此时 Cookie 仍可用；误标 AUTH_EXPIRED 会把账号打成过期、堵住重试。
    if (response.status === 401) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ArticleApiError(
        "PUBLISH_FAILED",
        "发布未成功，请稍后重试",
      );
    }
    return parseJson(response.body);
  }
}

/** 发布成功后取出作品 ID；与 article-api 契约一致。 */
export function douyinGraphicPostId(
  response: Record<string, unknown>,
): string {
  assertArticleResponse(response, "douyin", true);
  return articlePostId(response.item_id);
}
