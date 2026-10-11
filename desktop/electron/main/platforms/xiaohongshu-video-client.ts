/**
 * 小红书短视频 Cookie 直调：创作者 permit → ROS PUT → edith GET（snake_case）
 * videoid / query_transcode → 签名发帖。上传无需 x-s；读接口与发帖用 XYS_。
 */
import { open, readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { net } from "electron";
import type { AgentCookie } from "../protocol";
import { getProxySettings } from "../network-policy";
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
import { buildCookieHeader } from "./douyin-http-client";
import { createUploadMeter } from "./upload-progress";
import type { UploadedVideo, VideoUploadOptions } from "./video-api";
import {
  signXiaohongshuGetHeaders,
  signXiaohongshuPostHeaders,
  XiaohongshuXsSignError,
  XHS_DEFAULT_XSEC_APPID,
} from "./xiaohongshu-xs-sign";

const CREATOR_ORIGIN = "https://creator.xiaohongshu.com";
const EDITH_ORIGIN = "https://edith.xiaohongshu.com";
const NOTE_PATH = "/web_api/sns/v2/note";
const VIDEO_PERMIT_PATH =
  "/api/media/v1/upload/web/permit?biz_name=spectrum&scene=video&file_count=1&version=1&source=web";
const VIDEOID_PATH = "/web_api/sns/capa/postgw/videoid";
const TRANSCODE_PATH = "/web_api/sns/capa/postgw/query_transcode";
const REFERER = `${CREATOR_ORIGIN}/publish/publish?source=official`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
/** 与官方一致：视频不超过 4 小时 */
const MAX_DURATION_SEC = 14400;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024 * 1024;
const TRANSCODE_POLL_MS = 3000;
/**
 * ROS 单次 PUT 有请求体上限（部分节点对大文件直接 413 / 断连），
 * 超过该大小改走 S3 兼容分片：POST ?uploads → PUT ?partNumber&uploadId → POST ?uploadId。
 */
export const XHS_ROS_PART_BYTES = 5 * 1024 * 1024;
/** 发帖遇 461 时最多尝试次数（含首次）。 */
const NOTE_461_MAX_ATTEMPTS = 4;
const TRANSCODE_DEADLINE_MS = 900_000;

export interface XiaohongshuVideoHttpResponse {
  status: number;
  body: Uint8Array;
  headers?: Record<string, string>;
}

export interface XiaohongshuVideoHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<XiaohongshuVideoHttpResponse>;
}

/**
 * 走 Electron net.fetch（Chromium 网络栈 + 代理，不受页面 CORS 约束）。
 * session.fetch 对 ROS 跨域 PUT 会变成 no-cors：线路已 200 并回 X-Ros-Video-Id，
 * Promise 仍拒绝，后续 videoid 发不出。
 */
const defaultTransport: XiaohongshuVideoHttpTransport = {
  async request(options) {
    getProxySettings();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);
    // net.fetch 手写跨域 Referer（带路径）会被 Chromium 判为 invalid referrer 直接取消
    // （ERR_BLOCKED_BY_CLIENT）；改走 referrer + unsafe-url，线上仍带完整 Referer。
    const { Referer: referrer, ...requestHeaders } = options.headers;
    try {
      const response = await net.fetch(options.url, {
        method: options.method,
        headers: requestHeaders,
        body: options.body as BodyInit | undefined,
        signal: controller.signal,
        ...(referrer ? { referrer, referrerPolicy: "unsafe-url" as const } : {}),
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      let body = new Uint8Array();
      try {
        body = new Uint8Array(await response.arrayBuffer());
      } catch {
        // ROS PUT 成功体为空；读失败不掩盖已拿到的状态码与响应头
      }
      return {
        status: response.status,
        body,
        headers,
      };
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
        );
      }
      throw new ArticleApiError(
        "HTTP_REQUEST_FAILED",
        "暂时无法连接发布平台",
      );
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

function buildQuery(
  params: Record<string, string | number | boolean>,
): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    const value =
      typeof raw === "boolean" ? (raw ? "true" : "false") : String(raw);
    parts.push(
      `${key}=${encodeURIComponent(value).replace(/%2C/gi, ",")}`,
    );
  }
  return parts.join("&");
}

function rosPutHeaders(token: string): Record<string, string> {
  // ROS 只需临时密钥；Cookie/Origin 交给 net.fetch 默认行为，勿手写导致 no-cors。
  return {
    "User-Agent": USER_AGENT,
    "X-Cos-Security-Token": token,
  };
}

/** 头尾分段读 moov，对齐视频号短视频解析（moov 常在文件尾）。 */
async function readLocalVideoMeta(path: string): Promise<{
  width: number;
  height: number;
  duration: number;
  format: string;
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
    const sample = Buffer.concat([
      headBuf.subarray(0, Math.min(headBuf.length, 256 * 1024)),
      tailBuf,
    ]);
    const hasAvc = sample.includes(Buffer.from("avc1"));
    const hasHevc =
      sample.includes(Buffer.from("hvc1")) ||
      sample.includes(Buffer.from("hev1"));
    const format = hasAvc ? "AVC" : hasHevc ? "HEVC" : "AVC";
    return {
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      format,
    };
  } finally {
    await fh.close();
  }
}

export class XiaohongshuVideoClient {
  private readonly cookieHeader: string;
  private readonly a1: string;
  private disposed = false;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: XiaohongshuVideoHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
    private readonly rosPartBytes = XHS_ROS_PART_BYTES,
    private readonly note461RetryMs = 1500,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
    this.a1 = cookieMap(cookies).a1 ?? "";
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
    extra: Record<string, string> = {},
  ): Record<string, string> {
    return {
      "User-Agent": USER_AGENT,
      Cookie: this.cookieHeader,
      Accept: "application/json, text/plain, */*",
      Origin: CREATOR_ORIGIN,
      Referer: REFERER,
      ...extra,
    };
  }

  /** 视频笔记封面来自转码首帧，不走图片上传通道。 */
  async uploadImage(_path: string): Promise<UploadedArticleImage> {
    throw new ArticleApiError(
      "ARTICLE_API_CHANGED",
      "暂时无法自动发布，请稍后重试",
    );
  }

  /**
   * edith 签名 GET；params 必须已是 snake_case（官方 transform 后的线上形态）。
   */
  private async signedGet(
    path: string,
    params: Record<string, string | number | boolean>,
  ): Promise<Record<string, unknown>> {
    this.assertOpen();
    if (!this.a1) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    let signed: { "x-s": string; "x-t": string };
    try {
      signed = signXiaohongshuGetHeaders(path, this.a1, params, {
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
    const qs = buildQuery(params);
    const url = `${EDITH_ORIGIN}${path}${qs ? `?${qs}` : ""}`;
    const response = await this.transport.request({
      url,
      method: "GET",
      headers: this.baseHeaders({
        "x-s": signed["x-s"],
        "x-t": signed["x-t"],
      }),
      timeoutMs: this.timeoutMs,
    });
    if (response.status === 401 || response.status === 403) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    if (response.status === 406 || response.status < 200 || response.status >= 300) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法自动发布，请稍后重试",
      );
    }
    return parseJson(response.body);
  }

  /**
   * 兼容 VideoApiSession.request：仅用于签名发帖（POST JSON）。
   */
  async request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertOpen();
    if (data === undefined) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法自动发布，请稍后重试",
      );
    }
    if (!this.a1) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
    const uri = path.startsWith("http")
      ? new URL(path).pathname
      : path;
    const bodyText = JSON.stringify(data);
    let response: XiaohongshuVideoHttpResponse | undefined;
    // edith 对发帖偶发 461（风控拒签，笔记未创建）；每次重新生成 x-s/x-t 再试，有限次数。
    for (let attempt = 1; attempt <= NOTE_461_MAX_ATTEMPTS; attempt += 1) {
      this.assertOpen();
      let signed: { "x-s": string; "x-t": string };
      try {
        signed = signXiaohongshuPostHeaders(uri, this.a1, data, {
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
      response = await this.transport.request({
        url: path.startsWith("http") ? path : `${EDITH_ORIGIN}${uri}`,
        method: "POST",
        headers: this.baseHeaders({
          "Content-Type": "application/json;charset=UTF-8",
          "x-s": signed["x-s"],
          "x-t": signed["x-t"],
        }),
        body: Buffer.from(bodyText, "utf8"),
        timeoutMs: this.timeoutMs,
      });
      if (response.status !== 461) {
        break;
      }
      if (attempt < NOTE_461_MAX_ATTEMPTS) {
        await new Promise((resolve) => {
          setTimeout(resolve, this.note461RetryMs * attempt);
        });
      }
    }
    if (!response) {
      throw new ArticleApiError("PUBLISH_FAILED", "视频发布未成功，请稍后重试");
    }
    if (response.status === 461) {
      // 461 为平台风控拒绝，笔记未创建，可安全重试
      throw new ArticleApiError(
        "PLATFORM_REJECTED",
        "平台暂时拦截了本次发布，请稍后重试",
      );
    }
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
    return parsed;
  }

  /**
   * ROS（cloudType 4 / ros-upload 主机）：小文件整文件 PUT，`Content-Type: video/mp4`；
   * 大于分片阈值改走分片（POST ?uploads 不带 Content-Type，带 application/xml 会 415）。
   * 请求体用 Uint8Array。出站经 net.fetch：session.fetch 对 ROS 会 no-cors，
   * 线路 200 后仍拒绝，读不到 X-Ros-Video-Id。
   * @returns x-ros-video-id（可能为空，随后靠 videoid 接口补）
   */
  private async putRosVideo(
    objectUrl: string,
    token: string,
    path: string,
    size: number,
    timeoutMs: number,
    onProgress?: VideoUploadOptions["onProgress"],
  ): Promise<string> {
    const meter = createUploadMeter(size, onProgress);
    if (size > this.rosPartBytes) {
      return this.putRosVideoMultipart(objectUrl, token, path, size, timeoutMs, meter);
    }
    const bytes = await readFile(path);
    meter.start();
    const putRes = await this.transport.request({
      url: objectUrl,
      method: "PUT",
      headers: {
        ...rosPutHeaders(token),
        "Content-Type": "video/mp4",
      },
      body: bytes,
      timeoutMs,
    });
    if (putRes.status !== 200 && putRes.status !== 201) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法上传视频，请稍后重试",
      );
    }
    meter.finish();
    return String(putRes.headers?.["x-ros-video-id"] ?? "").trim();
  }

  /** 大文件分片上传；分片按需读盘，避免整文件进内存。 */
  private async putRosVideoMultipart(
    objectUrl: string,
    token: string,
    path: string,
    size: number,
    timeoutMs: number,
    meter: ReturnType<typeof createUploadMeter>,
  ): Promise<string> {
    const fail = (): never => {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "暂时无法上传视频，请稍后重试",
      );
    };
    const initRes = await this.transport.request({
      url: `${objectUrl}?uploads`,
      method: "POST",
      headers: rosPutHeaders(token),
      timeoutMs: this.timeoutMs,
    });
    const uploadId =
      initRes.status === 200
        ? (/<UploadId>([^<]+)<\/UploadId>/.exec(
            Buffer.from(initRes.body).toString("utf8"),
          )?.[1] ?? "")
        : "";
    if (!uploadId) {
      fail();
    }
    const query = `uploadId=${encodeURIComponent(uploadId)}`;
    const etags: string[] = [];
    meter.start();
    const fh = await open(path, "r");
    try {
      for (let offset = 0, part = 1; offset < size; part += 1) {
        this.assertOpen();
        const length = Math.min(this.rosPartBytes, size - offset);
        const chunk = Buffer.alloc(length);
        await fh.read(chunk, 0, length, offset);
        const partRes = await this.transport.request({
          url: `${objectUrl}?partNumber=${part}&${query}`,
          method: "PUT",
          headers: {
            ...rosPutHeaders(token),
            "Content-Type": "video/mp4",
          },
          body: new Uint8Array(chunk.buffer, chunk.byteOffset, length),
          timeoutMs,
        });
        const etag = String(partRes.headers?.etag ?? "").trim();
        if ((partRes.status !== 200 && partRes.status !== 201) || !etag) {
          fail();
        }
        etags.push(etag);
        offset += length;
        meter.add(length);
      }
    } finally {
      await fh.close();
    }
    const xml = `<CompleteMultipartUpload>${etags
      .map(
        (etag, index) =>
          `<Part><PartNumber>${index + 1}</PartNumber><ETag>${etag}</ETag></Part>`,
      )
      .join("")}</CompleteMultipartUpload>`;
    const doneRes = await this.transport.request({
      url: `${objectUrl}?${query}`,
      method: "POST",
      headers: {
        ...rosPutHeaders(token),
        "Content-Type": "application/xml",
      },
      body: Buffer.from(xml, "utf8"),
      timeoutMs: this.timeoutMs,
    });
    if (doneRes.status !== 200 && doneRes.status !== 201) {
      fail();
    }
    meter.finish();
    return String(doneRes.headers?.["x-ros-video-id"] ?? "").trim();
  }

  /**
   * permit → ROS PUT → videoid → 轮询 query_transcode 至首帧。
   * edith 读接口参数必须 snake_case，否则 videoid 无 data、转码永不回首帧。
   */
  async uploadVideo(
    path: string,
    options?: VideoUploadOptions,
  ): Promise<UploadedVideo> {
    this.assertOpen();
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        "AUTH_EXPIRED",
        "账号登录已失效，请重新授权",
      );
    }
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
    const local = await readLocalVideoMeta(path);
    if (
      !(local.duration > 0) ||
      local.duration > MAX_DURATION_SEC ||
      !(local.width > 0) ||
      !(local.height > 0)
    ) {
      throw new ArticleApiError("VIDEO_UNSUPPORTED", "请检查视频后重试");
    }
    // 官方：Format≠AVC 或音轨非 AAC 才转码；本机粗解析仅可靠识别有无 mp4a，无音轨时不强制转码
    const needTranscode = local.format !== "AVC";

    const permitRes = await this.transport.request({
      url: `${CREATOR_ORIGIN}${
        needTranscode
          ? VIDEO_PERMIT_PATH.replace("scene=video", "scene=preview_video")
          : VIDEO_PERMIT_PATH
      }`,
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
    const first = Array.isArray(asRecord(permit.data).uploadTempPermits)
      ? asRecord(
          (asRecord(permit.data).uploadTempPermits as unknown[])[0],
        )
      : {};
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
        "暂时无法上传视频，请稍后重试",
      );
    }
    const host = uploadAddr.startsWith("http")
      ? uploadAddr.replace(/\/$/, "")
      : `https://${uploadAddr}`;
    const objectUrl = `${host}/${fileId}`;
    const uploadTimeout = Math.max(this.timeoutMs, 30 * 60 * 1000);
    const rosVideoId = await this.putRosVideo(
      objectUrl,
      token,
      path,
      info.size,
      uploadTimeout,
      options?.onProgress,
    );

    // MAKE_VIDEOID 必须 snake_case；回执 video_id 供转码查询（与 ROS 头可能不同）
    const made = await this.signedGet(VIDEOID_PATH, {
      file_key: fileId,
      biz_name: "217",
    });
    if (made.success !== true || (made.code != null && made.code !== 0)) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }
    const madeId = String(
      articleRecord(made.data).video_id ?? "",
    ).trim();
    // 平台 video_id 可能超过 Number 安全整数，全程按字符串传递
    const videoId = madeId || rosVideoId;
    if (!videoId || videoId === "-1") {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认视频上传结果，请稍后重试",
      );
    }

    const deadline = Date.now() + TRANSCODE_DEADLINE_MS;
    let coverUri = "";
    let publishFileId = fileId;
    while (Date.now() < deadline) {
      this.assertOpen();
      const params: Record<string, string | number | boolean> = {
        video_id: videoId,
        need_transcode: needTranscode,
        resource_type: 0,
      };
      if (needTranscode) {
        params.level = "14";
      }
      const qt = await this.signedGet(TRANSCODE_PATH, params);
      const data = articleRecord(qt.data);
      const hasFirst =
        data.has_first_frame === true || data.hasFirstFrame === true;
      const firstFrame = String(
        data.first_frame_file_id ?? data.firstFrameFileId ?? "",
      ).trim();
      const hasTranscode =
        data.has_transcode_video === true ||
        data.hasTranscodeVideo === true;
      const transcodeId = String(
        data.transcode_video_file_id ??
          data.transcodeVideoFileId ??
          "",
      ).trim();
      if (hasFirst && firstFrame) {
        if (!needTranscode || (hasTranscode && transcodeId)) {
          coverUri = firstFrame;
          if (needTranscode && transcodeId) {
            publishFileId = transcodeId;
          }
          break;
        }
      }
      await new Promise((resolve) => {
        setTimeout(resolve, TRANSCODE_POLL_MS);
      });
    }
    if (!coverUri) {
      throw new ArticleApiError(
        "VIDEO_PROCESSING_TIMEOUT",
        "视频处理超时，请稍后重试",
      );
    }

    const videoTrack: Record<string, unknown> = {
      Format: local.format,
      Duration: local.duration,
      Width: local.width,
      Height: local.height,
      Rotation: 0,
    };
    return {
      vid: videoId,
      duration: local.duration,
      width: local.width,
      height: local.height,
      coverUri,
      fileId: publishFileId,
      originalMetadata: {
        video: videoTrack,
        audio: null,
      },
    };
  }
}
