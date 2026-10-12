import {
  composeDouyinGraphicDescription,
  isDouyinAuthorDeclaration,
  type DouyinAuthorDeclaration,
} from "../../../shared/douyin-graphic-settings";
import {
  normalizePlatformResourceRefs,
  topicRefsFromNames,
  type PlatformResourceRef,
} from "../../../shared/platform-resource";
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "../publish-protocol";
import {
  ArticleApiError,
  assertArticleActive,
} from "./article-api";
import { articleSchedule } from "./article-content";
import {
  DouyinGraphicClient,
  douyinGraphicPostId,
} from "./douyin-graphic-client";
import { douyinTopicNames } from "./douyin-topic-resolve";

export interface GraphicPublishOptions {
  payload: PlatformPublishStartPayload;
  onProgress: (progress: PlatformPublishProgressPayload) => void;
  signal: { cancelled: boolean };
  /** 可注入客户端以单测；生产默认 Cookie + 主进程 bdms/ImageX。 */
  createClient?: (
    options: GraphicPublishOptions,
  ) => Promise<DouyinGraphicClient> | DouyinGraphicClient;
}

// 2026-10-07 核对抖音创作者图文编辑器 ImageText、ImageTitle 和自主声明契约。
const DECLARATIONS: Record<Exclude<DouyinAuthorDeclaration, "none">, string> = {
  ai_generated: "aigc",
  personal_opinion: "personal_opinion",
  reposted: "from_net_v3",
  marketing: "marketing",
  fictional: "only_fun_new",
};

/** 抖音把标题作为描述前缀，type=7/8 标出标题和分隔符；偏移使用 UTF-16。 */
export function douyinGraphicCaption(
  title: string,
  body: string,
  topics: PlatformResourceRef[],
) {
  const tags = douyinTopicNames(topics);
  const byName = new Map(topics.map((topic) => [topic.name, topic.id]));
  const description = composeDouyinGraphicDescription(body, tags);
  const prefix = title.endsWith("。") ? title : `${title}。`;
  const extra: Record<string, unknown>[] = [
    { start: 0, end: title.length, hashtag_id: 0, hashtag_name: "", type: 7 },
  ];
  if (prefix.length > title.length) {
    extra.push({
      start: title.length,
      end: prefix.length,
      hashtag_id: 0,
      hashtag_name: "",
      type: 8,
    });
  }
  for (const match of description.matchAll(/#[^\s#]+/g)) {
    const name = match[0].slice(1);
    const id = byName.get(name) ?? "0";
    extra.push({
      start: prefix.length + match.index,
      end: prefix.length + match.index + match[0].length,
      hashtag_id: id === "0" ? 0 : id,
      hashtag_name: name,
      type: 1,
    });
  }
  return { text: prefix + description, text_extra: JSON.stringify(extra) };
}

/** 优先使用选择器保存的标识；未绑定名称再按官方搜索补齐。 */
async function resolveTopics(
  client: DouyinGraphicClient,
  input: {
    topicRefs?: PlatformResourceRef[];
    tags?: string[];
  },
  maxCount = 5,
): Promise<PlatformResourceRef[]> {
  const saved = normalizePlatformResourceRefs(input.topicRefs, maxCount);
  const seed =
    saved.length > 0 ? saved : topicRefsFromNames(input.tags ?? []);
  const resolved: PlatformResourceRef[] = [];
  for (const item of seed.slice(0, maxCount)) {
    if (item.id !== "0") {
      resolved.push(item);
      continue;
    }
    const match = (await client.searchTopics(item.name)).find(
      (candidate) => candidate.name === item.name,
    );
    resolved.push(match ?? item);
  }
  return normalizePlatformResourceRefs(resolved, maxCount);
}

/** Cookie 直调 ImageX 上传与 create_v2；主进程官方 bdms 签名，无隐藏窗。 */
export async function runDouyinGraphicPublish(
  options: GraphicPublishOptions,
): Promise<PlatformPublishResultPayload> {
  const { payload, signal, onProgress } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: "douyin" as const,
  };
  const emit = (
    phase: PlatformPublishProgressPayload["phase"],
    message: string,
  ) => {
    assertArticleActive(signal);
    onProgress({ ...base, phase, message });
  };
  let client: DouyinGraphicClient | undefined;
  let submitted = false;
  try {
    emit("accepted", "准备发布图文");
    const title = payload.title.trim();
    const paths = payload.mediaPaths ?? [];
    const body = payload.body?.trim() ?? "";
    const declaration = payload.authorDeclaration ?? "none";
    const visibility = (
      { public: 0, private: 1, friends: 2 } as Record<string, number>
    )[payload.visibility ?? "public"];
    const provisionalTags = [
      ...new Set(
        (payload.tags ?? [])
          .map((tag) => tag.trim().replace(/^#+/, ""))
          .filter(Boolean),
      ),
    ];
    if (
      payload.platform !== "douyin" ||
      !title ||
      title.length > 20 ||
      !body ||
      composeDouyinGraphicDescription(body, provisionalTags).length > 1000 ||
      paths.length < 1 ||
      paths.length > 30 ||
      paths.some((path) => !path.trim()) ||
      !payload.coverPath?.trim() ||
      visibility === undefined ||
      !isDouyinAuthorDeclaration(declaration) ||
      provisionalTags.length > 5 ||
      provisionalTags.some((tag) => /\s|#/.test(tag))
    ) {
      throw new ArticleApiError(
        "invalid_payload",
        "请检查图文标题、文案、图片和发布设置",
      );
    }
    const timing = articleSchedule(payload.scheduledAt);
    if (
      timing !== undefined &&
      (timing * 1000 < Date.now() + 2 * 3600000 ||
        timing * 1000 > Date.now() + 14 * 86400000)
    ) {
      throw new ArticleApiError(
        "invalid_payload",
        "发布时间需在 2 小时至 14 天内",
      );
    }
    emit("opening_creator", "连接发布平台");
    client =
      (await options.createClient?.(options)) ??
      new DouyinGraphicClient(payload.cookies);
    await client.prepare();
    const topics = await resolveTopics(client, payload);
    emit("uploading", "上传图文图片与封面");
    const uploaded = new Map<string, Awaited<ReturnType<DouyinGraphicClient["uploadImage"]>>>();
    for (const path of [...paths, payload.coverPath]) {
      assertArticleActive(signal);
      if (!uploaded.has(path)) {
        uploaded.set(path, await client.uploadImage(path));
      }
    }
    const cover = uploaded.get(payload.coverPath);
    if (!cover) {
      throw new ArticleApiError("MEDIA_MISSING", "找不到图片，请重新选择");
    }
    const item = {
      common: {
        media_type: 2,
        creation_id: payload.requestId,
        ...douyinGraphicCaption(title, body, topics),
        images: paths.map((path) => {
          const image = uploaded.get(path);
          if (!image) {
            throw new ArticleApiError(
              "MEDIA_MISSING",
              "找不到图片，请重新选择",
            );
          }
          return { uri: image.uri, width: image.width, height: image.height };
        }),
        visibility_type: visibility,
        download: payload.allowDownload === false ? 0 : 1,
        timing: timing ?? -1,
      },
      cover: { poster: cover.uri },
      ...(declaration === "none"
        ? {}
        : {
            declare: {
              user_declare_info: JSON.stringify({
                choose_value: DECLARATIONS[declaration],
              }),
            },
          }),
    };
    emit("submitting", "提交图文");
    submitted = true;
    const response = await client.createAweme(item);
    const platformPostId = douyinGraphicPostId(response);
    try {
      onProgress({ ...base, phase: "done", message: "图文已提交" });
    } catch {
      // 窗口关闭不影响保存已提交的回执。
    }
    return {
      ...base,
      ok: true,
      platformPostId,
      platformUrl: `https://www.douyin.com/note/${platformPostId}`,
    };
  } catch (error) {
    const known = error instanceof ArticleApiError;
    return {
      ...base,
      ok: false,
      errorCode: known
        ? error.code
        : submitted
          ? "PUBLISH_RESULT_UNKNOWN"
          : "PUBLISH_FAILED",
      error: known
        ? error.message
        : submitted
          ? "尚未确认发布结果，请先到平台查看"
          : "图文发布未成功，请稍后重试",
    };
  } finally {
    await client?.dispose().catch(() => {});
  }
}
