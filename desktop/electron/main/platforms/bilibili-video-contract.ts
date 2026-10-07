import { ArticleApiError, articlePostId, articleRecord } from "./article-api";

/** 当前 videoup getBasicParams/saveSetting 契约；仅处理单视频基础投稿。 */
export interface BilibiliVideoSubmission {
  title: string;
  description: string;
  partitionId: number;
  tags: string[];
  coverUrl: string;
  filename: string;
  cid: string;
  visibility: "public" | "private";
  copyright: 1 | 2;
  source?: string;
  creationStatementId?: number;
  scheduledAt?: string;
}

export function buildBilibiliVideoSubmission(input: BilibiliVideoSubmission) {
  const title = input.title.trim();
  const tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
  const cid = typeof input.cid === "string" ? input.cid : "";
  if (
    !title ||
    title.length > 30 ||
    input.description.length > 1000 ||
    !Number.isSafeInteger(input.partitionId) ||
    input.partitionId <= 0 ||
    tags.length === 0 ||
    tags.length > 10 ||
    tags.some((tag) => tag.includes(",")) ||
    !input.coverUrl ||
    !input.filename ||
    !cid ||
    !/^[1-9]\d*$/.test(cid) ||
    !["public", "private"].includes(input.visibility) ||
    ![1, 2].includes(input.copyright) ||
    (input.copyright === 2 && !input.source?.trim())
  ) {
    throw new ArticleApiError(
      "invalid_payload",
      "请检查视频、封面、分区和标签",
    );
  }
  const scheduled = input.scheduledAt
    ? new Date(input.scheduledAt).getTime()
    : undefined;
  if (
    scheduled !== undefined &&
    (!Number.isFinite(scheduled) || scheduled <= Date.now())
  ) {
    throw new ArticleApiError("invalid_payload", "请重新设置发布时间");
  }
  if (
    input.creationStatementId !== undefined &&
    (!Number.isSafeInteger(input.creationStatementId) ||
      input.creationStatementId <= 0)
  ) {
    throw new ArticleApiError("invalid_payload", "请重新选择创作声明");
  }
  // 官方 videos[].cid 为数字；超出安全整数时仍保留字符串，避免精度丢失。
  const cidNumber = Number(cid);
  const cidValue =
    Number.isSafeInteger(cidNumber) && String(cidNumber) === cid
      ? cidNumber
      : cid;
  return {
    title,
    desc: input.description,
    // 非 type_mode 时官方默认 desc_format_id=0。
    desc_format_id: 0,
    tid: input.partitionId,
    tag: tags.join(","),
    cover: input.coverUrl,
    copyright: input.copyright,
    dynamic: "",
    ...(input.copyright === 2 ? { source: input.source!.trim() } : {}),
    ...(input.creationStatementId !== undefined
      ? { creation_statement: { id: input.creationStatementId } }
      : {}),
    ...(scheduled !== undefined ? { dtime: Math.floor(scheduled / 1000) } : {}),
    videos: [
      {
        filename: input.filename,
        title,
        desc: "",
        cid: cidValue,
      },
    ],
    is_only_self: input.visibility === "private" ? 1 : 0,
    // 与官方 getSubmitParams / submitVideoAPI 缺省对齐。
    space_hidden: 2,
    watermark: { state: 0 },
    no_reprint: input.copyright === 1 ? 1 : 0,
    interactive: 0,
    recreate: 0,
    // Mac=2 / Windows=1 / 其它=3，对应官方 tp()。
    web_os:
      process.platform === "win32" ? 1 : process.platform === "darwin" ? 2 : 3,
  };
}

/** 上传 cid 不能代替投稿 aid/bvid；未知回执禁止当成成功。 */
export function parseBilibiliVideoReceipt(response: unknown) {
  const result = articleRecord(response);
  if (result.code === -101) {
    throw new ArticleApiError("AUTH_EXPIRED", "账号登录已失效，请重新授权");
  }
  if (typeof result.code === "number" && result.code !== 0) {
    throw new ArticleApiError(
      "PUBLISH_REJECTED",
      "平台未接受发布，请检查内容和发布设置",
      {
        code: result.code,
        message:
          typeof result.message === "string"
            ? result.message.slice(0, 200)
            : undefined,
      },
    );
  }
  const data = articleRecord(result.data);
  const aid = articlePostId(data.aid);
  const bvid = typeof data.bvid === "string" ? data.bvid : "";
  if (
    result.code !== 0 ||
    !aid ||
    !/^[1-9]\d*$/.test(aid) ||
    !/^BV[0-9A-Za-z]{10}$/.test(bvid)
  ) {
    throw new ArticleApiError(
      "PUBLISH_RESULT_UNKNOWN",
      "发布结果待确认，请先查看平台作品",
    );
  }
  return {
    aid,
    bvid,
    platformPostUrl: `https://www.bilibili.com/video/${bvid}/`,
  };
}
