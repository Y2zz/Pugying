/**
 * 视频号助手 HTTP 客户端：Cookie 会话下取上传凭证、COS 分片上传、图文/短视频 post_create。
 * 创作者接口非开放平台契约，endpoint / 字段以实发核对为准。
 * 短视频须先 post_clip_video 取得 clipKey，再 post_create（mediaType=4）；
 * 部分成功响应不含 exportId，需按描述从 post_list 回读。
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { net, nativeImage } from 'electron';
import type { AgentCookie } from '../protocol';
import { buildCookieHeader } from './douyin-http-client';
import { ArticleApiError } from './article-api';

const ASSISTANT_ORIGIN = 'https://channels.weixin.qq.com';
const APPLY_UPLOAD_URL = 'https://finderassistancea.video.qq.com/applyuploaddfs';
const UPLOAD_PART_URL = 'https://finderassistancec.video.qq.com/uploadpartdfs';
const COMPLETE_UPLOAD_URL =
  'https://finderassistancea.video.qq.com/completepartuploaddfs';
const CHUNK_SIZE = 8 * 1024 * 1024;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
/** 短视频创建后无 exportId 时，按描述轮询列表的次数与间隔 */
const EXPORT_ID_POLL_ATTEMPTS = 8;
const EXPORT_ID_POLL_MS = 1500;

export interface ChannelsHttpResponse {
  status: number;
  body: Uint8Array;
}

export interface ChannelsHttpTransport {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
    timeoutMs: number;
  }): Promise<ChannelsHttpResponse>;
}

export interface ChannelsUploadedImage {
  url: string;
  width: number;
  height: number;
  size: number;
  md5sum: string;
}

export interface ChannelsGraphicPostInput {
  finderId: string;
  description: string;
  images: ChannelsUploadedImage[];
  /** 话题纯文本（不含 #） */
  topics: string[];
  traceKey: string;
  uploadCdnStart: number;
  uploadCdnEnd: number;
}

export interface ChannelsUploadedVideo {
  url: string;
  width: number;
  height: number;
  /** 秒，整数（videoPlayLen） */
  durationSec: number;
  /** 秒，浮点（clip / report） */
  duration: number;
  size: number;
  md5sum: string;
}

export interface ChannelsVideoPostInput {
  finderId: string;
  /** 短标题，平台要求约 6～16 字 */
  shortTitle: string;
  description: string;
  topics: string[];
  video: ChannelsUploadedVideo;
  cover: ChannelsUploadedImage;
  clipKey: string;
  traceKey: string;
  uploadCdnStart: number;
  uploadCdnEnd: number;
  uploadCostMs: number;
}

/** 视频号助手作品可见性：1 公开，3 仅自己可见（与 post_list.visibleType 一致） */
export const CHANNELS_VISIBLE_PUBLIC = 1;
export const CHANNELS_VISIBLE_PRIVATE = 3;

/** 从 MP4 moov 粗读宽高与时长，避免依赖本机 ffmpeg。缺字段时返回 0（勿默认 1s，否则会误导 post_create）。 */
export function readMp4Meta(bytes: Buffer): {
  width: number;
  height: number;
  duration: number;
} {
  const scan = (buf: Buffer): Array<{ type: string; body: Buffer }> => {
    const found: Array<{ type: string; body: Buffer }> = [];
    let offset = 0;
    while (offset + 8 <= buf.length) {
      let size = buf.readUInt32BE(offset);
      const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
      let header = 8;
      // size=1 表示后续 8 字节为 64 位盒长；size=0 表示延至缓冲末尾
      if (size === 1) {
        if (offset + 16 > buf.length) {
          break;
        }
        size = Number(buf.readBigUInt64BE(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = buf.length - offset;
      }
      if (size < header || offset + size > buf.length) {
        // 盒被截断（常见于仅读文件头时碰到跨段 mdat）——停在本层，避免假拼接错位
        break;
      }
      const body = buf.subarray(offset + header, offset + size);
      if (
        type === 'moov' ||
        type === 'trak' ||
        type === 'mdia' ||
        type === 'minf' ||
        type === 'stbl'
      ) {
        found.push(...scan(body));
      } else if (type === 'mvhd' || type === 'tkhd') {
        found.push({ type, body });
      }
      offset += size;
    }
    return found;
  };
  const boxes = scan(bytes);
  let duration = 0;
  let width = 0;
  let height = 0;
  for (const { type, body } of boxes) {
    if (type === 'mvhd' && body.length >= 20) {
      const version = body[0];
      if (version === 0) {
        const timescale = body.readUInt32BE(12);
        const raw = body.readUInt32BE(16);
        if (timescale > 0) {
          duration = raw / timescale;
        }
      } else if (body.length >= 32) {
        const timescale = body.readUInt32BE(20);
        const raw = Number(body.readBigUInt64BE(24));
        if (timescale > 0) {
          duration = raw / timescale;
        }
      }
    }
    if (type === 'tkhd') {
      const version = body[0];
      // 音频轨 tkhd 宽高为 0，保留已解析到的视频轨尺寸
      if (version === 0 && body.length >= 84) {
        const w = Math.round(body.readUInt32BE(76) / 65536);
        const h = Math.round(body.readUInt32BE(80) / 65536);
        if (w > 0 && h > 0) {
          width = w;
          height = h;
        }
      } else if (version === 1 && body.length >= 96) {
        const w = Math.round(body.readUInt32BE(88) / 65536);
        const h = Math.round(body.readUInt32BE(92) / 65536);
        if (w > 0 && h > 0) {
          width = w;
          height = h;
        }
      }
    }
  }
  return { width, height, duration };
}

/** 头尾分段各自解析后合并；勿把 head+tail 拼成一块再扫（mdat 跨切点会打断盒遍历）。 */
export function mergeMp4Meta(
  parts: Array<{ width: number; height: number; duration: number }>,
): { width: number; height: number; duration: number } {
  let width = 0;
  let height = 0;
  let duration = 0;
  for (const part of parts) {
    if (!width && part.width > 0) {
      width = part.width;
    }
    if (!height && part.height > 0) {
      height = part.height;
    }
    if (!duration && part.duration > 0) {
      duration = part.duration;
    }
  }
  return { width, height, duration };
}

/**
 * 在缓冲中定位 moov 盒起点（含 4 字节 size）。
 * 文件尾切片常从 mdat 中部开始，必须按四字符码搜索，不能假定 offset=0 已对齐。
 */
export function findMoovAtomOffset(buf: Buffer): number {
  const magic = Buffer.from('moov');
  let from = 0;
  while (from + 8 <= buf.length) {
    const at = buf.indexOf(magic, from);
    if (at < 4) {
      return -1;
    }
    const sizeOffset = at - 4;
    let size = buf.readUInt32BE(sizeOffset);
    if (size === 1) {
      if (sizeOffset + 16 > buf.length) {
        from = at + 1;
        continue;
      }
      size = Number(buf.readBigUInt64BE(sizeOffset + 8));
    } else if (size === 0) {
      size = buf.length - sizeOffset;
    }
    if (size >= 8 && sizeOffset + size <= buf.length) {
      return sizeOffset;
    }
    from = at + 1;
  }
  return -1;
}

const defaultTransport: ChannelsHttpTransport = {
  async request(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);
    try {
      const response = await net.fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
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

function rid(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

function encodeXArguments(args: Record<string, string | number>): string {
  return Object.entries(args)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join('&');
}

function parseJson(body: Uint8Array): Record<string, unknown> {
  try {
    const text = Buffer.from(body).toString('utf8');
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class ChannelsGraphicClient {
  private readonly cookieHeader: string;
  private finderId = '';
  private authKey = '';
  private weixinNum = 0;
  private appType = 251;
  private pictureFileType = 20304;
  private videoFileType = 20302;
  private scene = 2;

  constructor(
    cookies: AgentCookie[],
    private readonly transport: ChannelsHttpTransport = defaultTransport,
    private readonly timeoutMs = 60_000,
  ) {
    this.cookieHeader = buildCookieHeader(cookies);
  }

  async prepare(): Promise<void> {
    if (!this.cookieHeader) {
      throw new ArticleApiError(
        'AUTH_EXPIRED',
        '账号登录已失效，请重新授权',
      );
    }
    const auth = await this.assistantPost(
      '/cgi-bin/mmfinderassistant-bin/auth/auth_data',
      this.commonBody(''),
    );
    this.assertAssistantOk(auth, false, 'auth');
    const finderUser = asRecord(asRecord(auth.data).finderUser);
    const finderId = String(finderUser.finderUsername ?? '').trim();
    if (!finderId) {
      throw new ArticleApiError(
        'AUTH_EXPIRED',
        '账号登录已失效，请重新授权',
      );
    }
    this.finderId = finderId;

    const upload = await this.assistantPost(
      '/cgi-bin/mmfinderassistant-bin/helper/helper_upload_params',
      this.commonBody(this.finderId),
    );
    this.assertAssistantOk(upload, false);
    const data = asRecord(upload.data);
    const authKey = String(data.authKey ?? '').trim();
    const uin = Number(data.uin);
    if (!authKey || !Number.isFinite(uin) || uin <= 0) {
      throw new ArticleApiError(
        'ARTICLE_API_CHANGED',
        '暂时无法自动发布，请稍后重试',
      );
    }
    this.authKey = authKey;
    this.weixinNum = uin;
    this.appType = Number(data.appType) || 251;
    this.pictureFileType = Number(data.pictureFileType) || 20304;
    this.videoFileType = Number(data.videoFileType) || 20302;
    this.scene = Number(data.scene) || 2;
  }

  getFinderId(): string {
    return this.finderId;
  }

  async uploadImage(path: string): Promise<ChannelsUploadedImage> {
    const info = await stat(path);
    if (!info.isFile() || info.size <= 0) {
      throw new ArticleApiError('MEDIA_MISSING', '找不到图片，请重新选择');
    }
    const bytes = await readFile(path);
    const image = nativeImage.createFromBuffer(bytes);
    const size = image.getSize();
    if (!(size.width > 0) || !(size.height > 0)) {
      throw new ArticleApiError(
        'ARTICLE_IMAGE_UNSUPPORTED',
        '请使用 JPEG、PNG 或平台支持的图片格式',
      );
    }
    const ratio = size.width / size.height;
    if (ratio < 0.33 || ratio > 3) {
      throw new ArticleApiError(
        'invalid_payload',
        '图片比例不合适，请调整后重试',
      );
    }
    const { url, md5sum } = await this.uploadBytes(
      path,
      bytes,
      this.pictureFileType,
      '图片上传未成功，请稍后重试',
    );
    return {
      url,
      width: size.width,
      height: size.height,
      size: bytes.length,
      md5sum,
    };
  }

  async uploadVideo(path: string): Promise<ChannelsUploadedVideo> {
    const info = await stat(path);
    if (!info.isFile() || info.size <= 0) {
      throw new ArticleApiError('MEDIA_MISSING', '找不到视频，请重新选择');
    }
    const { open } = await import('node:fs/promises');
    const handle = await open(path, 'r');
    const parts: Array<{ width: number; height: number; duration: number }> =
      [];
    try {
      const headLen = Math.min(info.size, 8 * 1024 * 1024);
      const headBuf = Buffer.alloc(headLen);
      await handle.read(headBuf, 0, headLen, 0);
      parts.push(readMp4Meta(headBuf));
      // moov 常在文件尾；头尾分开扫，避免假拼接后 mdat 截断导致扫不到时长
      if (info.size > headLen) {
        const tailLen = Math.min(info.size, 4 * 1024 * 1024);
        const tailBuf = Buffer.alloc(tailLen);
        await handle.read(tailBuf, 0, tailLen, info.size - tailLen);
        const moovAt = findMoovAtomOffset(tailBuf);
        parts.push(
          readMp4Meta(moovAt >= 0 ? tailBuf.subarray(moovAt) : tailBuf),
        );
      }
    } finally {
      await handle.close();
    }
    const meta = mergeMp4Meta(parts);
    if (!(meta.width > 0) || !(meta.height > 0) || !(meta.duration > 0)) {
      throw new ArticleApiError(
        'VIDEO_UNSUPPORTED',
        '请使用平台支持的视频格式',
      );
    }
    const { url, md5sum } = await this.uploadFilePath(
      path,
      info.size,
      this.videoFileType,
      '视频上传未成功，请稍后重试',
    );
    return {
      url,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      durationSec: Math.max(1, Math.round(meta.duration)),
      size: info.size,
      md5sum,
    };
  }

  async getTraceKey(): Promise<string> {
    const response = await this.assistantPost(
      '/cgi-bin/mmfinderassistant-bin/post/get-finder-post-trace-key',
      {
        objectId: null,
        ...this.commonBody(this.finderId),
      },
    );
    this.assertAssistantOk(response, false);
    const traceKey = String(asRecord(response.data).traceKey ?? '').trim();
    if (!traceKey) {
      throw new ArticleApiError(
        'ARTICLE_API_CHANGED',
        '暂时无法自动发布，请稍后重试',
      );
    }
    return traceKey;
  }

  async postCreate(input: ChannelsGraphicPostInput): Promise<string> {
    const now = Date.now();
    const media = input.images.map((image) => ({
      url: image.url,
      fileSize: image.size,
      thumbUrl: image.url,
      fullThumbUrl: image.url,
      mediaType: 2,
      width: image.width,
      height: image.height,
      md5sum: image.md5sum,
      cardShowStyle: 0,
      coverUrl: image.url,
      fullCoverUrl: image.url,
    }));
    const topics = input.topics.filter(Boolean);
    const response = await this.assistantPost(
      '/cgi-bin/mmfinderassistant-bin/post/post_create',
      {
        objectType: 0,
        longitude: 0,
        latitude: 0,
        feedLongitude: 0,
        feedLatitude: 0,
        originalFlag: 0,
        topics,
        isFullPost: 1,
        handleFlag: 2,
        traceInfo: {
          traceKey: input.traceKey,
          uploadCdnStart: input.uploadCdnStart,
          uploadCdnEnd: input.uploadCdnEnd,
        },
        objectDesc: {
          mpTitle: '',
          description: input.description,
          extReading: {},
          mediaType: 2,
          location: {},
          topic: topics.length
            ? {
                finderTopicInfo: ` ${topics.map(() => '1').join(' ')} `,
              }
            : {},
          event: {},
          mentionedUser: [],
          media,
          member: {},
        },
        postFlag: 0,
        mode: 1,
        clientid: randomUUID(),
        ...this.commonBody(input.finderId),
        timestamp: String(now),
      },
    );
    this.assertAssistantOk(response, true);
    const data = asRecord(response.data);
    const baseResp = asRecord(data.baseResp);
    if (Number(baseResp.errcode ?? 0) !== 0) {
      throw new ArticleApiError(
        'PUBLISH_FAILED',
        '图文发布未成功，请稍后重试',
        response,
      );
    }
    const exportId = String(data.exportId ?? '').trim();
    if (!exportId) {
      throw new ArticleApiError(
        'PUBLISH_RESULT_UNKNOWN',
        '尚未确认发布结果，请先到平台查看',
        response,
      );
    }
    return exportId;
  }

  /**
   * 创建后改可见性。post_create 忽略 visibleType，须用本接口；
   * objectId 与列表里的 exportId 同值（实发核对）。
   */
  async updateVisible(
    objectId: string,
    visibleType: typeof CHANNELS_VISIBLE_PUBLIC | typeof CHANNELS_VISIBLE_PRIVATE,
  ): Promise<void> {
    const response = await this.assistantPost(
      '/cgi-bin/mmfinderassistant-bin/post/post_update_visible',
      {
        objectId,
        visibleType,
        ...this.commonBody(this.finderId),
      },
    );
    this.assertAssistantOk(response, true);
    const data = asRecord(response.data);
    if (Number(data.errorCode ?? 0) !== 0) {
      throw new ArticleApiError(
        'PUBLISH_FAILED',
        '发布未成功，请稍后重试',
        response,
      );
    }
  }

  /**
   * 短视频上传后须先 clip，拿到 clipKey 才能 post_create；
   * 缺此步时平台常返回 300001。
   */
  async postClipVideo(input: {
    videoUrl: string;
    width: number;
    height: number;
    duration: number;
    fileSize: number;
    traceKey: string;
    uploadCdnStart: number;
    uploadCdnEnd: number;
  }): Promise<string> {
    const response = await this.assistantPost(
      '/cgi-bin/mmfinderassistant-bin/post/post_clip_video',
      {
        url: input.videoUrl,
        timeStart: 0,
        cropDuration: 0,
        height: input.height,
        width: input.width,
        x: 0,
        y: 0,
        clipOriginVideoInfo: {
          width: input.width,
          height: input.height,
          duration: input.duration,
          fileSize: input.fileSize,
        },
        traceInfo: {
          traceKey: input.traceKey,
          uploadCdnStart: input.uploadCdnStart,
          uploadCdnEnd: input.uploadCdnEnd,
        },
        targetWidth: input.width,
        targetHeight: input.height,
        type: 4,
        useAstraThumbCover: 1,
        ...this.commonBody(this.finderId),
      },
    );
    this.assertAssistantOk(response, false);
    const clipKey = String(asRecord(response.data).clipKey ?? '').trim();
    if (!clipKey) {
      throw new ArticleApiError(
        'ARTICLE_API_CHANGED',
        '暂时无法自动发布，请稍后重试',
        response,
      );
    }
    return clipKey;
  }

  async postCreateVideo(input: ChannelsVideoPostInput): Promise<string> {
    const now = Date.now();
    const topics = input.topics.filter(Boolean);
    const createBody: Record<string, unknown> = {
      objectType: 0,
      longitude: 0,
      latitude: 0,
      feedLongitude: 0,
      feedLatitude: 0,
      originalFlag: 0,
      topics,
      isFullPost: 1,
      handleFlag: 2,
      videoClipTaskId: input.clipKey,
      traceInfo: {
        traceKey: input.traceKey,
        uploadCdnStart: input.uploadCdnStart,
        uploadCdnEnd: input.uploadCdnEnd,
      },
      objectDesc: {
        mpTitle: '',
        description: input.description,
        extReading: {},
        mediaType: 4,
        location: {},
        topic: topics.length
          ? {
              finderTopicInfo: ` ${topics.map(() => '1').join(' ')} `,
            }
          : {},
        event: {},
        mentionedUser: [],
        media: [
          {
            url: input.video.url,
            fileSize: input.video.size,
            thumbUrl: input.cover.url,
            fullThumbUrl: input.cover.url,
            mediaType: 4,
            videoPlayLen: input.video.durationSec,
            width: input.video.width,
            height: input.video.height,
            md5sum: input.video.md5sum,
            cardShowStyle: 2,
            coverUrl: input.cover.url,
            fullCoverUrl: input.cover.url,
            urlCdnTaskId: input.clipKey,
          },
        ],
        shortTitle: [{ shortTitle: input.shortTitle }],
        member: {},
      },
      report: {
        // commonBody 须在前，避免其 timestamp(number) 覆盖短视频所需的字符串时间戳
        ...this.commonBody(input.finderId),
        clipKey: input.clipKey,
        draftId: input.clipKey,
        timestamp: String(now),
        height: input.video.height,
        width: input.video.width,
        duration: input.video.duration,
        fileSize: input.video.size,
        uploadCost: input.uploadCostMs,
      },
      postFlag: 0,
      mode: 1,
      clientid: randomUUID(),
      // commonBody 在前，保证 timestamp 保持字符串（与助手实发一致）
      ...this.commonBody(input.finderId),
      timestamp: String(now),
    };
    const response = await this.assistantPost(
      '/cgi-bin/mmfinderassistant-bin/post/post_create',
      createBody,
    );
    this.assertAssistantOk(response, true);
    const data = asRecord(response.data);
    const baseResp = asRecord(data.baseResp);
    if (Number(baseResp.errcode ?? 0) !== 0) {
      throw new ArticleApiError(
        'PUBLISH_FAILED',
        '视频发布未成功，请稍后重试',
        response,
      );
    }
    const fromCreate = String(data.exportId ?? '').trim();
    if (fromCreate) {
      return fromCreate;
    }
    // 短视频成功时常只有 baseResp，须按描述从列表回读 exportId
    const fromList = await this.findExportIdByDescription(input.description);
    if (!fromList) {
      throw new ArticleApiError(
        'PUBLISH_RESULT_UNKNOWN',
        '尚未确认发布结果，请先到平台查看',
        response,
      );
    }
    return fromList;
  }

  /** 按描述精确匹配最近作品；用于 create 未回 exportId 时确认回执。 */
  async findExportIdByDescription(description: string): Promise<string | null> {
    const needle = description.trim();
    if (!needle) {
      return null;
    }
    for (let attempt = 0; attempt < EXPORT_ID_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, EXPORT_ID_POLL_MS);
        });
      }
      const response = await this.assistantPost(
        '/cgi-bin/mmfinderassistant-bin/post/post_list',
        {
          pageSize: 20,
          currentPage: 1,
          ...this.commonBody(this.finderId),
        },
      );
      this.assertAssistantOk(response, false);
      const list = asRecord(response.data).list;
      if (!Array.isArray(list)) {
        continue;
      }
      for (const item of list) {
        const row = asRecord(item);
        const desc = asRecord(row.desc);
        if (String(desc.description ?? '').trim() !== needle) {
          continue;
        }
        const exportId = String(row.exportId ?? '').trim();
        if (exportId) {
          return exportId;
        }
      }
    }
    return null;
  }

  private commonBody(finderId: string): Record<string, unknown> {
    return {
      timestamp: Date.now(),
      _log_finder_uin: '',
      _log_finder_id: finderId,
      rawKeyBuff: null,
      pluginSessionId: null,
      scene: 7,
      reqScene: 7,
    };
  }

  private async assistantPost(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = `${ASSISTANT_ORIGIN}${path}?_rid=${rid()}`;
    const payload = Buffer.from(JSON.stringify(body));
    const response = await this.rawRequest({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Referer: `${ASSISTANT_ORIGIN}/platform/post/create`,
        Origin: ASSISTANT_ORIGIN,
        Cookie: this.cookieHeader,
        'X-WECHAT-UIN': this.weixinNum
          ? String(this.weixinNum)
          : '0000000000',
      },
      body: payload,
    });
    if (response.status === 401 || response.status === 403) {
      throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ArticleApiError('PUBLISH_FAILED', '发布未成功，请稍后重试');
    }
    return parseJson(response.body);
  }

  private assertAssistantOk(
    response: Record<string, unknown>,
    submitted: boolean,
    kind: 'auth' | 'publish' = 'publish',
  ): void {
    const errCode = Number(response.errCode);
    if (errCode === 0) {
      return;
    }
    // 仅将明确的登录失效码标为 AUTH_EXPIRED。
    // 300001/300002 也出现在缺 clip、载荷不齐等发布失败上，不能一律当掉登录
    // （否则会误标账号 expired，阻塞重试）。
    const authExpiredCodes = [300003, 300004, 300330, 300334, -14];
    if (kind === 'auth' || authExpiredCodes.includes(errCode)) {
      throw new ArticleApiError('AUTH_EXPIRED', '账号登录已失效，请重新授权');
    }
    throw new ArticleApiError(
      submitted ? 'PUBLISH_RESULT_UNKNOWN' : 'PUBLISH_FAILED',
      submitted
        ? '尚未确认发布结果，请先到平台查看'
        : '发布未成功，请稍后重试',
      response,
    );
  }

  private async uploadBytes(
    path: string,
    bytes: Buffer,
    fileType: number,
    failMessage: string,
  ): Promise<{ url: string; md5sum: string }> {
    const taskId = randomUUID();
    const fileKey = basename(path) || `file-${taskId}`;
    const ends: number[] = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      ends.push(Math.min(bytes.length, offset + CHUNK_SIZE));
    }
    const uploadId = await this.applyUpload(
      fileKey,
      taskId,
      bytes.length,
      ends,
      fileType,
      failMessage,
    );
    const partInfo: Array<{ PartNumber: number; ETag: string }> = [];
    const hash = createHash('md5');
    for (let index = 0; index < ends.length; index += 1) {
      const start = index === 0 ? 0 : ends[index - 1];
      const end = ends[index];
      const chunk = bytes.subarray(start, end);
      hash.update(chunk);
      const etag = await this.uploadPart(
        fileKey,
        taskId,
        bytes.length,
        uploadId,
        index + 1,
        chunk,
        fileType,
        failMessage,
      );
      partInfo.push({ PartNumber: index + 1, ETag: etag });
    }
    const url = await this.completeUpload(
      fileKey,
      taskId,
      bytes.length,
      uploadId,
      partInfo,
      fileType,
      failMessage,
    );
    return { url, md5sum: hash.digest('hex') };
  }

  /** 按路径分片上传大文件，边读边算 md5，避免整段进内存。 */
  private async uploadFilePath(
    path: string,
    fileSize: number,
    fileType: number,
    failMessage: string,
  ): Promise<{ url: string; md5sum: string }> {
    const taskId = randomUUID();
    const fileKey = basename(path) || `file-${taskId}`;
    const ends: number[] = [];
    for (let offset = 0; offset < fileSize; offset += CHUNK_SIZE) {
      ends.push(Math.min(fileSize, offset + CHUNK_SIZE));
    }
    const uploadId = await this.applyUpload(
      fileKey,
      taskId,
      fileSize,
      ends,
      fileType,
      failMessage,
    );
    const { open } = await import('node:fs/promises');
    const handle = await open(path, 'r');
    const partInfo: Array<{ PartNumber: number; ETag: string }> = [];
    const hash = createHash('md5');
    try {
      for (let index = 0; index < ends.length; index += 1) {
        const start = index === 0 ? 0 : ends[index - 1];
        const end = ends[index];
        const chunk = Buffer.alloc(end - start);
        await handle.read(chunk, 0, chunk.length, start);
        hash.update(chunk);
        const etag = await this.uploadPart(
          fileKey,
          taskId,
          fileSize,
          uploadId,
          index + 1,
          chunk,
          fileType,
          failMessage,
        );
        partInfo.push({ PartNumber: index + 1, ETag: etag });
      }
    } finally {
      await handle.close();
    }
    const url = await this.completeUpload(
      fileKey,
      taskId,
      fileSize,
      uploadId,
      partInfo,
      fileType,
      failMessage,
    );
    return { url, md5sum: hash.digest('hex') };
  }

  private xArguments(
    fileKey: string,
    taskId: string,
    fileSize: number,
    fileType: number,
  ): string {
    return encodeXArguments({
      apptype: this.appType,
      filetype: fileType,
      weixinnum: this.weixinNum,
      filekey: fileKey,
      filesize: fileSize,
      taskid: taskId,
      scene: this.scene,
    });
  }

  private async applyUpload(
    fileKey: string,
    taskId: string,
    fileSize: number,
    ends: number[],
    fileType: number,
    failMessage: string,
  ): Promise<string> {
    const body = Buffer.from(
      JSON.stringify({ BlockSum: ends.length, BlockPartLength: ends }),
    );
    const response = await this.rawRequest({
      url: APPLY_UPLOAD_URL,
      method: 'PUT',
      headers: {
        Authorization: this.authKey,
        'Content-MD5': 'null',
        'X-Arguments': this.xArguments(fileKey, taskId, fileSize, fileType),
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body,
      failMessage,
    });
    const parsed = parseJson(response.body);
    const uploadId = String(parsed.UploadID ?? '').trim();
    if (!uploadId) {
      throw new ArticleApiError('PUBLISH_FAILED', failMessage, parsed);
    }
    return uploadId;
  }

  private async uploadPart(
    fileKey: string,
    taskId: string,
    fileSize: number,
    uploadId: string,
    partNumber: number,
    chunk: Uint8Array,
    fileType: number,
    failMessage: string,
  ): Promise<string> {
    const url = `${UPLOAD_PART_URL}?PartNumber=${partNumber}&UploadID=${encodeURIComponent(uploadId)}&QuickUpload=2`;
    const response = await this.rawRequest({
      url,
      method: 'PUT',
      headers: {
        Authorization: this.authKey,
        'Content-MD5': 'null',
        'X-Arguments': this.xArguments(fileKey, taskId, fileSize, fileType),
        'Content-Type': 'application/octet-stream',
        'User-Agent': USER_AGENT,
      },
      body: Buffer.from(chunk),
      failMessage,
    });
    const parsed = parseJson(response.body);
    const etag = String(parsed.ETag ?? '').trim();
    if (!etag) {
      throw new ArticleApiError('PUBLISH_FAILED', failMessage, parsed);
    }
    return etag;
  }

  private async completeUpload(
    fileKey: string,
    taskId: string,
    fileSize: number,
    uploadId: string,
    partInfo: Array<{ PartNumber: number; ETag: string }>,
    fileType: number,
    failMessage: string,
  ): Promise<string> {
    const body = Buffer.from(
      JSON.stringify({ TransFlag: '0_0', PartInfo: partInfo }),
    );
    const response = await this.rawRequest({
      url: `${COMPLETE_UPLOAD_URL}?UploadID=${encodeURIComponent(uploadId)}`,
      method: 'POST',
      headers: {
        Authorization: this.authKey,
        'Content-MD5': 'null',
        'X-Arguments': this.xArguments(fileKey, taskId, fileSize, fileType),
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body,
      failMessage,
    });
    const parsed = parseJson(response.body);
    const downloadUrl = String(parsed.DownloadURL ?? '').trim();
    if (!downloadUrl.startsWith('http')) {
      throw new ArticleApiError('PUBLISH_FAILED', failMessage, parsed);
    }
    return downloadUrl;
  }

  private async rawRequest(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Buffer;
    failMessage?: string;
  }): Promise<ChannelsHttpResponse> {
    try {
      return await this.transport.request({
        url: options.url,
        method: options.method,
        headers: options.headers,
        body: options.body,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || /aborted|timeout/i.test(error.message))
      ) {
        throw new ArticleApiError('HTTP_TIMEOUT', '发布请求超时，请稍后重试');
      }
      throw new ArticleApiError(
        'PUBLISH_FAILED',
        options.failMessage ?? '发布未成功，请稍后重试',
      );
    }
  }
}
