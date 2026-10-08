import { BrowserWindow, session, type Session } from "electron";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { injectCookies } from "../auth-browser";
import {
  ArticleApiError,
  articleRecord,
  assertArticleActive,
  assertArticleResponse,
  type ArticlePlatform,
  type ArticlePublishOptions,
  type UploadedArticleImage,
} from "./article-api";
import {
  BILIBILI_ARTICLE_RUNTIME,
  DOUYIN_ARTICLE_RUNTIME,
  TOUTIAO_ARTICLE_RUNTIME,
  TOUTIAO_GRAPHIC_RUNTIME,
  XIAOHONGSHU_GRAPHIC_RUNTIME,
} from "./article-platform-runtime";
import { signBilibiliQuery } from "./bilibili-wbi";
import {
  createPublishMediaChannel,
  type PublishMediaChannel,
} from "./publish-media-protocol";
import type { UploadedVideo, VideoApiSession } from "./video-api";
import { BILIBILI_VIDEO_RUNTIME } from "./bilibili-video-runtime";
import { TOUTIAO_VIDEO_RUNTIME } from "./toutiao-video-runtime";
import { XIAOHONGSHU_VIDEO_RUNTIME } from "./xiaohongshu-video-runtime";

export type CookiePublishPlatform = ArticlePlatform | "xiaohongshu";

const SESSION_DIAG = join(tmpdir(), "pugying-xhs-upload-diag.log");

function sessionDiag(line: string): void {
  try {
    appendFileSync(SESSION_DIAG, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* 诊断落盘失败不影响发布 */
  }
}

/** 图文与文章共用平台 Cookie、图片上传和签名传输，不依赖文章正文。 */
export type CookiePublishSessionOptions = Pick<
  ArticlePublishOptions,
  "payload" | "onProgress" | "signal"
>;

const CONFIG = {
  douyin: {
    host: "creator.douyin.com",
    domain: "douyin.com",
    url: "https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new",
    runtime: DOUYIN_ARTICLE_RUNTIME,
    paths: [
      "/web/api/media/aweme/create_v2/",
      "/web/api/media/user/info/",
      "/web/api/media/item/info/",
      "/aweme/v1/search/challengesug/",
      "/web/api/mix/list/",
    ],
  },
  toutiao: {
    host: "mp.toutiao.com",
    domain: "toutiao.com",
    url: "https://mp.toutiao.com/profile_v4/graphic/publish",
    runtime: TOUTIAO_ARTICLE_RUNTIME,
    paths: [
      "/xigua/api/upload/PublishVideo",
      "/xigua/api/upload/GetPublishAuth",
      "/mp/agw/article/wtt",
      "/mp/agw/article/wtt/edit",
      "/mp/agw/article/new",
      "/mp/agw/article/publish",
      "/mp/agw/diversity/publish/strategy/v1/check/",
    ],
  },
  xiaohongshu: {
    host: "creator.xiaohongshu.com",
    domain: "xiaohongshu.com",
    url: "https://creator.xiaohongshu.com/publish/publish?source=official&target=image",
    runtime: XIAOHONGSHU_GRAPHIC_RUNTIME,
    paths: ["/web_api/sns/v2/note", "/web_api/sns/capa/postgw/note/detail"],
  },
  bilibili: {
    host: "member.bilibili.com",
    domain: "bilibili.com",
    url: "https://member.bilibili.com/york/read-editor",
    runtime: BILIBILI_ARTICLE_RUNTIME,
    paths: [
      "/x/vupre/web/archive/pre",
      "/x/vu/web/add/v3",
      "/x/web-interface/nav",
      "/x/dynamic/feed/create/opus_init_check",
      "/x/dynamic/feed/create/opus",
      "/x/article/up/lists",
    ],
  },
} as const;

function imageMime(bytes: Buffer): string {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) {
    return "image/gif";
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

class CookieArticleApiSession implements VideoApiSession {
  private closed = false;
  private submitting = false;
  private cancelTimer: ReturnType<typeof setInterval>;
  private wbiKeys?: { image: string; sub: string };
  private verificationAttempted = false;

  constructor(
    private readonly platform: CookiePublishPlatform,
    private readonly options: CookiePublishSessionOptions,
    private readonly isolated: Session,
    private readonly window: BrowserWindow,
    private readonly videoChannel?: PublishMediaChannel,
  ) {
    if (platform === "douyin") {
      isolated.webRequest.onHeadersReceived(
        {
          urls: ["https://creator.douyin.com/web/api/media/aweme/create_v2/*"],
        },
        (details, callback) => {
          callback({});
          const needsVerification = Object.keys(
            details.responseHeaders || {},
          ).some(
            (name) => name.toLowerCase() === "x-tt-verify-passport-decision",
          );
          if (needsVerification && this.submitting && !window.isDestroyed()) {
            window.show();
            window.focus();
            options.onProgress({
              requestId: options.payload.requestId,
              targetId: options.payload.targetId,
              platform,
              phase: "submitting",
              message: "请在平台窗口完成验证",
            });
          }
        },
      );
    }
    this.cancelTimer = setInterval(() => {
      if (
        options.signal.cancelled &&
        !this.submitting &&
        !window.isDestroyed()
      ) {
        window.destroy();
      }
    }, 100);
  }

  async open(): Promise<void> {
    const config = CONFIG[this.platform];
    sessionDiag(
      `open ${this.platform} contentType=${String(this.options.payload.contentType ?? "")} cookies=${this.options.payload.cookies.length}`,
    );
    const cookies = this.options.payload.cookies
      .filter((cookie) => {
        const host = cookie.domain?.replace(/^\./, "").toLowerCase();
        return (
          (!host ||
            host === config.domain ||
            host.endsWith(`.${config.domain}`)) &&
          (!cookie.expirationDate || cookie.expirationDate > Date.now() / 1000)
        );
      })
      .map((cookie) => ({ ...cookie, domain: cookie.domain || config.host }));
    if (!cookies.length) {
      throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
    }
    await injectCookies(this.isolated, cookies);
    assertArticleActive(this.options.signal);
    // 平台辅助 iframe 可能很晚才结束加载；主文档就绪即可开始等待签名 SDK。
    const domReady = new Promise<void>((resolve) =>
      this.window.webContents.once("dom-ready", () => resolve()),
    );
    await this.bounded(
      Promise.race([
        this.window.loadURL(
          this.platform === "douyin" &&
            this.options.payload.contentType === "graphic"
            ? "https://creator.douyin.com/creator-micro/content/post/image"
            : this.platform === "douyin" &&
                (!this.options.payload.contentType ||
                  this.options.payload.contentType === "video")
              ? "https://creator.douyin.com/creator-micro/content/post/video"
              : this.platform === "toutiao" &&
                  this.options.payload.contentType === "graphic"
                ? "https://mp.toutiao.com/profile_v4/weitoutiao/publish"
                : this.platform === "xiaohongshu" &&
                    this.options.payload.contentType === "video"
                  ? "https://creator.xiaohongshu.com/publish/publish?source=official&target=video"
                  : this.platform === "toutiao" &&
                      this.options.payload.contentType === "video"
                    ? "https://mp.toutiao.com/profile_v4/xigua/upload-video"
                    : this.platform === "bilibili" &&
                        this.options.payload.contentType === "video"
                      ? "https://member.bilibili.com/york/videoup"
                      : config.url,
        ),
        domReady,
      ]),
      30000,
    );
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      assertArticleActive(this.options.signal);
      if (this.window.isDestroyed()) {
        throw new ArticleApiError(
          "HTTP_REQUEST_FAILED",
          "暂时无法连接发布平台",
        );
      }
      const url = new URL(this.window.webContents.getURL());
      if (url.hostname !== config.host || /login|passport/.test(url.pathname)) {
        throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
      }
      // 视频运行时可能按需拉取官方 chunk（如小红书字段转换），单次求值需长于图文。
      const videoRuntime =
        (this.platform === "xiaohongshu" ||
          this.platform === "toutiao" ||
          this.platform === "bilibili") &&
        this.options.payload.contentType === "video";
      const ready = await this.bounded(
        this.window.webContents.mainFrame.executeJavaScript(
          this.platform === "toutiao" &&
            this.options.payload.contentType === "graphic"
            ? TOUTIAO_GRAPHIC_RUNTIME
            : this.platform === "xiaohongshu" &&
                this.options.payload.contentType === "video"
              ? XIAOHONGSHU_VIDEO_RUNTIME
              : this.platform === "toutiao" &&
                  this.options.payload.contentType === "video"
                ? TOUTIAO_VIDEO_RUNTIME
                : this.platform === "bilibili" &&
                    this.options.payload.contentType === "video"
                  ? BILIBILI_VIDEO_RUNTIME
                  : config.runtime,
        ),
        videoRuntime ? 20000 : 5000,
      );
      if (ready === "AUTH_EXPIRED") {
        throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
      }
      if (ready === true) {
        return;
      }
      if (typeof ready === "string" && ready.startsWith("WAIT_")) {
        sessionDiag(`ready ${this.platform} ${ready}`);
      } else if (ready !== true) {
        sessionDiag(
          `ready ${this.platform} value=${JSON.stringify(ready)} url=${this.window.isDestroyed() ? "destroyed" : this.window.webContents.getURL()}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    sessionDiag(`open timeout ${this.platform}`);
    throw new ArticleApiError(
      "ARTICLE_API_CHANGED",
      "暂时无法连接发布功能，请稍后重试",
    );
  }

  private async bounded<T>(promise: Promise<T>, timeoutMs = 60000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            if (!this.window.isDestroyed()) {
              this.window.destroy();
            }
            reject(
              new ArticleApiError(
                this.submitting ? "PUBLISH_RESULT_UNKNOWN" : "HTTP_TIMEOUT",
                this.submitting
                  ? "尚未确认发布结果，请先到平台查看"
                  : "连接平台超时，请稍后重试",
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async execute<T>(script: string, timeoutMs = 60000): Promise<T> {
    if (this.closed || this.window.isDestroyed()) {
      assertArticleActive(this.options.signal);
      throw new ArticleApiError("HTTP_REQUEST_FAILED", "暂时无法连接发布平台");
    }
    const wrapped = `(async () => {
      if (location.hostname !== ${JSON.stringify(CONFIG[this.platform].host)}) {
        return { ok: false, code: 'AUTH_EXPIRED' };
      }
      try { return { ok: true, data: await (${script}) }; }
      catch (error) {
        const response = error?.response || error?.err?.response;
        const code = response?.data?.status_code || error?.status_code || response?.status || error?.code;
        return {
          ok: false,
          code: String(code || ''),
          receipt: error?.receipt ?? {
            stage: 'caught',
            keys: error && typeof error === 'object' ? Object.keys(error) : [],
            name: error?.name,
            message: typeof error?.message === 'string' ? error.message.slice(0, 160) : undefined,
          },
        };
      }
    })()`;
    let response: { ok: boolean; data: T; code?: string; receipt?: unknown };
    try {
      response = (await this.bounded(
        this.window.webContents.mainFrame.executeJavaScript(wrapped),
        timeoutMs,
      )) as typeof response;
    } catch (error) {
      assertArticleActive({
        cancelled: this.options.signal.cancelled && !this.submitting,
      });
      if (error instanceof ArticleApiError) {
        throw error;
      }
      throw new ArticleApiError(
        this.submitting ? "PUBLISH_RESULT_UNKNOWN" : "HTTP_REQUEST_FAILED",
        this.submitting
          ? "尚未确认发布结果，请先到平台查看"
          : "暂时无法连接发布平台，请稍后重试",
      );
    }
    if (!response?.ok) {
      assertArticleActive({
        cancelled: this.options.signal.cancelled && !this.submitting,
      });
      if (response?.code === "ARTICLE_API_CHANGED") {
        sessionDiag(
          `execute ARTICLE_API_CHANGED receipt=${JSON.stringify(response.receipt ?? null)}`,
        );
        throw new ArticleApiError(
          "ARTICLE_API_CHANGED",
          "暂时无法连接发布功能，请稍后重试",
        );
      }
      if (response?.code === "MEDIA_MISSING") {
        throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
      }
      if (response?.code === "VIDEO_UNSUPPORTED") {
        throw new ArticleApiError(
          "VIDEO_UNSUPPORTED",
          this.platform === "xiaohongshu"
            ? "请选择时长不超过 4 小时的视频"
            : "请选择平台支持的视频",
        );
      }
      if (response?.code === "VIDEO_PROCESSING_TIMEOUT") {
        throw new ArticleApiError(
          "VIDEO_PROCESSING_TIMEOUT",
          "视频处理超时，请稍后重试",
        );
      }
      if (response?.code === "VIDEO_UPLOAD_FAILED") {
        sessionDiag(
          `execute VIDEO_UPLOAD_FAILED receipt=${JSON.stringify(response.receipt ?? null)}`,
        );
        // B 站 preupload 406/601「上传过快」属频控，提示稍后再试而非泛化失败。
        const receiptText = JSON.stringify(response.receipt ?? "");
        const rateLimited =
          this.platform === "bilibili" &&
          (/上传过快|稍作休息/.test(receiptText) ||
            /"code"\s*:\s*601/.test(receiptText) ||
            /"http_status"\s*:\s*406/.test(receiptText));
        throw new ArticleApiError(
          "VIDEO_UPLOAD_FAILED",
          rateLimited ? "上传过于频繁，请稍后再试" : "视频上传失败，请稍后重试",
        );
      }
      if (
        [
          "AUTH_EXPIRED",
          "-101",
          "401",
          "1003",
          "2001",
          "-100",
          "-10001",
        ].includes(response?.code || "")
      ) {
        throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
      }
      if (["2222", "-352"].includes(response?.code || "")) {
        throw new ArticleApiError(
          "PLATFORM_VERIFICATION_REQUIRED",
          "平台需要验证，请到创作者中心完成后再发布",
        );
      }
      if (response?.code === "403") {
        throw new ArticleApiError(
          "PLATFORM_REJECTED",
          "平台未接受本次发布，请到创作者中心查看账号要求",
        );
      }
      throw new ArticleApiError(
        this.submitting ? "PUBLISH_RESULT_UNKNOWN" : "HTTP_REQUEST_FAILED",
        this.submitting
          ? "尚未确认发布结果，请先到平台查看"
          : "暂时无法连接发布平台，请稍后重试",
      );
    }
    return response.data;
  }

  private async bilibiliQuery(
    params: Record<string, unknown>,
  ): Promise<string> {
    if (!this.wbiKeys) {
      const nav = await this.execute<Record<string, unknown>>(
        `window.__pugyingArticleApi.request('/x/web-interface/nav')`,
      );
      assertArticleResponse(nav, "bilibili");
      const data = articleRecord(nav.data);
      if (data.isLogin !== true) {
        throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
      }
      const images = articleRecord(data.wbi_img);
      const key = (url: unknown) =>
        typeof url === "string"
          ? new URL(url).pathname.split("/").pop()?.split(".")[0] || ""
          : "";
      this.wbiKeys = { image: key(images.img_url), sub: key(images.sub_url) };
      if (!this.wbiKeys.image || !this.wbiKeys.sub) {
        throw new ArticleApiError(
          "ARTICLE_API_CHANGED",
          "暂时无法连接文章发布功能，请稍后重试",
        );
      }
    }
    const webParams = await this.execute<Record<string, unknown>>(
      "window.__pugyingArticleApi.wbiParams()",
    );
    return signBilibiliQuery(
      { ...params, ...webParams },
      this.wbiKeys.image,
      this.wbiKeys.sub,
    );
  }

  async request(
    path: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    assertArticleActive(this.options.signal);
    const url = new URL(path, `https://${CONFIG[this.platform].host}`);
    const bilibiliVideoPaths = ["/x/vupre/web/archive/pre", "/x/vu/web/add/v3"];
    if (
      this.platform === "bilibili" &&
      (this.options.payload.contentType === "video"
        ? !bilibiliVideoPaths.includes(url.pathname)
        : bilibiliVideoPaths.includes(url.pathname))
    ) {
      throw new ArticleApiError("invalid_payload", "发布请求不可用");
    }
    if (
      url.origin !== `https://${CONFIG[this.platform].host}` ||
      !(CONFIG[this.platform].paths as readonly string[]).includes(
        url.pathname,
      ) ||
      (url.pathname === "/web_api/sns/capa/postgw/note/detail" &&
        (data !== undefined ||
          url.searchParams.size !== 2 ||
          !/^[a-f0-9]{24}$/.test(url.searchParams.get("note_id") ?? "") ||
          url.searchParams.get("source") !== "web")) ||
      (url.pathname === "/mp/agw/article/wtt/edit" &&
        (data !== undefined ||
          url.searchParams.size !== 1 ||
          !/^\d+$/.test(url.searchParams.get("id") ?? ""))) ||
      (url.pathname === "/web/api/media/item/info/" &&
        (data !== undefined ||
          url.searchParams.size !== 1 ||
          !/^\d+$/.test(url.searchParams.get("item_id") ?? ""))) ||
      (url.pathname === "/aweme/v1/search/challengesug/" &&
        (data !== undefined ||
          url.searchParams.size !== 3 ||
          !url.searchParams.get("keyword")?.trim() ||
          url.searchParams.get("source") !== "challenge_create" ||
          url.searchParams.get("aid") !== "2906")) ||
      (url.pathname === "/web/api/mix/list/" &&
        (data !== undefined ||
          url.searchParams.size !== 6 ||
          url.searchParams.get("status") !== "0,1,2,3,6" ||
          url.searchParams.get("count") !== "20" ||
          url.searchParams.get("cursor") !== "0" ||
          url.searchParams.get("should_query_new_mix") !== "1" ||
          url.searchParams.get("device_platform") !== "web" ||
          url.searchParams.get("aid") !== "1128")) ||
      (url.pathname === "/x/article/up/lists" &&
        (data !== undefined ||
          url.searchParams.size !== 2 ||
          !/^\d+$/.test(url.searchParams.get("mid") ?? "") ||
          !["0", "1"].includes(url.searchParams.get("sort") ?? "")))
    ) {
      throw new ArticleApiError("invalid_payload", "发布请求不可用");
    }
    const submit = data !== undefined;
    if (
      this.platform === "bilibili" &&
      this.options.payload.contentType !== "video"
    ) {
      const params: Record<string, unknown> = Object.fromEntries(
        url.searchParams,
      );
      if (submit) {
        Object.assign(
          params,
          await this.execute<Record<string, unknown>>(
            "window.__pugyingArticleApi.riskParams()",
          ),
        );
        const cookies = await this.isolated.cookies.get({
          url: "https://api.bilibili.com",
        });
        const csrf =
          cookies.find((cookie) => cookie.name === "bili_jct")?.value || "";
        if (!csrf) {
          throw new ArticleApiError(
            "AUTH_EXPIRED",
            "账号登录已失效，请重新授权",
          );
        }
        params.csrf = csrf;
        params.gaia_source = "main_web";
        params["w_opus_req.upload_id"] = articleRecord(data.opus_req).upload_id;
      }
      // 原生客户端会先把 URL 参数合并到 params，再进行 WBI 签名。
      path = `${url.pathname}?${await this.bilibiliQuery(params)}`;
    }
    assertArticleActive(this.options.signal);
    this.submitting = submit;
    try {
      const result = await this.execute<Record<string, unknown>>(
        `window.__pugyingArticleApi.request(${JSON.stringify(path)}, ${JSON.stringify(data) ?? "undefined"})`,
        this.platform === "douyin" && submit ? 600000 : 60000,
      );
      if (
        this.platform === "bilibili" &&
        this.options.payload.contentType !== "video" &&
        submit &&
        result.code === -352 &&
        !this.verificationAttempted &&
        (await this.execute<boolean>(
          "window.__pugyingArticleApi.hasVerification()",
        ))
      ) {
        // 平台已明确拒绝本次提交；由用户完成官方验证后，仅重提一次。
        this.verificationAttempted = true;
        this.submitting = false;
        this.window.show();
        this.window.focus();
        this.options.onProgress({
          requestId: this.options.payload.requestId,
          targetId: this.options.payload.targetId,
          platform: this.platform,
          phase: "submitting",
          message: "请在平台窗口完成验证",
        });
        try {
          await this.execute("window.__pugyingArticleApi.verify()", 600000);
        } catch {
          assertArticleActive(this.options.signal);
          throw new ArticleApiError(
            "PLATFORM_VERIFICATION_REQUIRED",
            "平台验证尚未完成，请完成后再发布",
          );
        } finally {
          if (!this.window.isDestroyed()) {
            this.window.hide();
          }
        }
        assertArticleActive(this.options.signal);
        // 清除上一轮签名参数，重新生成签名和环境参数。
        return this.request(url.pathname, data);
      }
      return result;
    } catch (error) {
      // 已发出的提交可能成功；未知结果不能当作取消或可自动重试的失败。
      if (submit && !(error instanceof ArticleApiError)) {
        throw new ArticleApiError(
          "PUBLISH_RESULT_UNKNOWN",
          "尚未确认发布结果，请先到平台查看",
        );
      }
      if (!submit) {
        assertArticleActive(this.options.signal);
      }
      throw error;
    }
  }

  async uploadImage(path: string): Promise<UploadedArticleImage> {
    assertArticleActive(this.options.signal);
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
    if (
      (["douyin", "xiaohongshu"].includes(this.platform) &&
        mime === "image/gif") ||
      (this.platform === "toutiao" &&
        !["image/jpeg", "image/png"].includes(mime))
    ) {
      throw new ArticleApiError(
        "ARTICLE_IMAGE_UNSUPPORTED",
        "该平台需要 JPEG 或 PNG 图片，请重新选择",
      );
    }
    const query =
      this.platform === "bilibili" &&
      this.options.payload.contentType !== "video"
        ? await this.bilibiliQuery({})
        : "";
    let csrf = "";
    if (
      this.platform === "bilibili" &&
      this.options.payload.contentType !== "video"
    ) {
      const cookies = await this.isolated.cookies.get({
        url: "https://api.bilibili.com",
      });
      csrf = cookies.find((cookie) => cookie.name === "bili_jct")?.value || "";
      if (!csrf) {
        throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
      }
    }
    assertArticleActive(this.options.signal);
    const result = await this.execute<UploadedArticleImage>(`(async () => {
      const binary = atob(${JSON.stringify(bytes.toString("base64"))});
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const file = new File([bytes], ${JSON.stringify(basename(path))}, { type: ${JSON.stringify(mime)} });
      return window.__pugyingArticleApi.upload(file, ${JSON.stringify(query)}, ${JSON.stringify(csrf)});
    })()`);
    const url =
      typeof result?.url === "string"
        ? result.url.replace(/^http:/, "https:").replace(/^\/\//, "https://")
        : "";
    if (
      !/^https:\/\//.test(url) ||
      !result.uri ||
      !(result.width > 0) ||
      !(result.height > 0)
    ) {
      throw new ArticleApiError(
        "ARTICLE_API_CHANGED",
        "未能确认图片上传结果，请稍后重试",
      );
    }
    return { ...result, url };
  }

  async uploadVideo(path: string): Promise<UploadedVideo> {
    assertArticleActive(this.options.signal);
    if (!this.videoChannel || !isAbsolute(path)) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到视频，请重新选择");
    }
    const extension = extname(path).toLowerCase();
    if (
      ![
        ".mp4",
        ".mov",
        ".m4v",
        ".webm",
        ".avi",
        ".mkv",
        ".flv",
        ".wmv",
        ".ts",
        ".mpeg4",
        ".mpg",
        ".m4",
      ].includes(extension) ||
      info.size <= 0 ||
      info.size >
        (this.platform === "toutiao"
          ? 32
          : this.platform === "xiaohongshu"
            ? 20
            : 16) *
          1024 ** 3
    ) {
      throw new ArticleApiError(
        "VIDEO_UNSUPPORTED",
        this.platform === "toutiao"
          ? "请选择 32GB 以内的平台支持的视频"
          : this.platform === "xiaohongshu"
            ? "请选择 20GB 以内的平台支持的视频"
            : "请选择 16GB 以内的平台支持的视频",
      );
    }
    const videoUrl = this.videoChannel.expose(path);
    let previousPercent = -1;
    let readingProgress = false;
    const progressTimer = setInterval(() => {
      if (
        readingProgress ||
        this.options.signal.cancelled ||
        this.window.isDestroyed()
      ) {
        return;
      }
      readingProgress = true;
      void this.window.webContents.mainFrame
        .executeJavaScript("window.__pugyingVideoProgress")
        .then((value: unknown) => {
          if (typeof value !== "number" || !Number.isFinite(value)) {
            return;
          }
          const percent = Math.floor(value);
          if (percent === previousPercent) {
            return;
          }
          previousPercent = percent;
          this.options.onProgress({
            requestId: this.options.payload.requestId,
            targetId: this.options.payload.targetId,
            platform: this.platform,
            phase: "uploading",
            message:
              percent >= 100 ? "视频已上传，等待处理" : `上传视频 ${percent}%`,
          });
        })
        .catch(() => {})
        .finally(() => {
          readingProgress = false;
        });
    }, 1000);
    try {
      sessionDiag(`uploadVideo start ${this.platform} bytes=${info.size}`);
      const result = await this.execute<UploadedVideo>(
        `(async () => {
        if (typeof window.__pugyingArticleApi?.uploadVideo !== 'function') {
          throw { code: 'ARTICLE_API_CHANGED', receipt: { stage: 'no_uploadVideo' } };
        }
        const response = await fetch(${JSON.stringify(videoUrl)}, { credentials: 'omit', redirect: 'error' });
        if (!response.ok) { throw { code: 'MEDIA_MISSING', receipt: { stage: 'fetch', status: response.status } }; }
        const blob = await response.blob();
        const file = new File([blob], ${JSON.stringify(basename(path))}, { type: ${JSON.stringify(extension === ".mov" ? "video/quicktime" : extension === ".webm" ? "video/webm" : "video/mp4")} });
        return window.__pugyingArticleApi.uploadVideo(file);
      })()`,
        4 * 3600000,
      );
      sessionDiag(
        `uploadVideo ok vid=${String(result?.vid ?? "").slice(0, 32)} cover=${Boolean(result?.coverUri)}`,
      );
      assertArticleActive(this.options.signal);
      if (
        !/^[a-zA-Z0-9_-]+$/.test(result?.vid ?? "") ||
        !(result.duration > 0 && result.width > 0 && result.height > 0) ||
        (!["toutiao", "bilibili"].includes(this.platform) && !result.coverUri)
      ) {
        throw new ArticleApiError(
          "ARTICLE_API_CHANGED",
          "未能确认视频上传结果，请稍后重试",
        );
      }
      if (
        result.duration >
        (this.platform === "bilibili"
          ? 36000
          : this.platform === "toutiao"
            ? 10800
            : this.platform === "xiaohongshu"
              ? 14400
              : 3600)
      ) {
        throw new ArticleApiError(
          "VIDEO_UNSUPPORTED",
          this.platform === "bilibili"
            ? "视频时长不能超过 10 小时"
            : this.platform === "toutiao"
              ? "视频时长不能超过 3 小时"
              : this.platform === "xiaohongshu"
                ? "视频时长不能超过 4 小时"
                : "视频时长不能超过 1 小时",
        );
      }
      return result;
    } finally {
      clearInterval(progressTimer);
      this.videoChannel.revoke();
    }
  }

  async dispose(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.videoChannel?.dispose();
    clearInterval(this.cancelTimer);
    if (this.platform === "douyin") {
      this.isolated.webRequest.onHeadersReceived(null);
    }
    if (!this.window.isDestroyed()) {
      this.window.destroy();
    }
    await Promise.allSettled([
      this.isolated.clearStorageData(),
      this.isolated.clearCache(),
      this.isolated.closeAllConnections(),
    ]);
  }
}

export async function createArticleApiSession(
  platform: CookiePublishPlatform,
  options: CookiePublishSessionOptions,
): Promise<VideoApiSession> {
  assertArticleActive(options.signal);
  const isolated = session.fromPartition(
    `${options.payload.contentType ?? "video"}-api-${platform}-${randomUUID()}`,
  );
  isolated.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  const videoChannel =
    ["douyin", "xiaohongshu", "toutiao", "bilibili"].includes(platform) &&
    (!options.payload.contentType || options.payload.contentType === "video")
      ? createPublishMediaChannel(
          isolated,
          platform === "bilibili"
            ? "https://member.bilibili.com"
            : platform === "toutiao"
              ? "https://mp.toutiao.com"
              : platform === "xiaohongshu"
                ? "https://creator.xiaohongshu.com"
                : "https://creator.douyin.com",
        )
      : undefined;
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    webPreferences: {
      session: isolated,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const api = new CookieArticleApiSession(
    platform,
    options,
    isolated,
    window,
    videoChannel,
  );
  try {
    await api.open();
    return api;
  } catch (error) {
    await api.dispose();
    assertArticleActive(options.signal);
    throw error;
  }
}
