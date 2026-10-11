import type { Session } from "electron";
import type { AgentCookie } from "../protocol";
import { articleRecord } from "./article-api";
import { signBilibiliQuery } from "./bilibili-wbi";
import {
  cookieSessionJsonGet,
  withEphemeralCookieSession,
} from "./ephemeral-cookie-session";

const API_ORIGIN = "https://api.bilibili.com";
const MEMBER_ORIGIN = "https://member.bilibili.com";
const NAV_URL = `${API_ORIGIN}/x/web-interface/nav`;
const REFERER = "https://member.bilibili.com/";

/** 与编辑器 wbiParams 对齐的固定设备/语言参数；表单只读探测不依赖页面 _render_data_。 */
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

export type BilibiliNavContext = {
  mid: string;
  imageKey: string;
  subKey: string;
};

/** 读 nav：登录 mid + WBI 密钥；失败返回 null。 */
export async function readBilibiliNav(
  isolated: Session,
): Promise<BilibiliNavContext | null> {
  const nav = await cookieSessionJsonGet(isolated, NAV_URL, {
    Referer: REFERER,
    Origin: MEMBER_ORIGIN,
  });
  if (!nav || Number(nav.code) !== 0) {
    return null;
  }
  const data = articleRecord(nav.data);
  if (data.isLogin !== true || data.mid == null) {
    return null;
  }
  const mid = String(data.mid);
  if (!/^\d+$/.test(mid)) {
    return null;
  }
  const images = articleRecord(data.wbi_img);
  const imageKey = wbiKeyFromUrl(images.img_url);
  const subKey = wbiKeyFromUrl(images.sub_url);
  if (!imageKey || !subKey) {
    return null;
  }
  return { mid, imageKey, subKey };
}

/** 对 api.bilibili.com 路径做 WBI 签名 GET。 */
export async function bilibiliSignedGet(
  isolated: Session,
  pathname: string,
  params: Record<string, string>,
  keys: Pick<BilibiliNavContext, "imageKey" | "subKey">,
): Promise<Record<string, unknown> | null> {
  const query = signBilibiliQuery(
    { ...params, ...WBI_WEB_PARAMS },
    keys.imageKey,
    keys.subKey,
  );
  return cookieSessionJsonGet(isolated, `${API_ORIGIN}${pathname}?${query}`, {
    Referer: REFERER,
    Origin: MEMBER_ORIGIN,
  });
}

/**
 * 表单侧 B 站只读：Cookie 会话内执行；可选先读 nav。
 * 不打开隐藏窗。
 */
export async function withBilibiliCookieApi<T>(
  cookies: AgentCookie[],
  run: (ctx: {
    isolated: Session;
    nav: BilibiliNavContext | null;
  }) => Promise<T>,
): Promise<T> {
  return withEphemeralCookieSession("bilibili-form-probe", cookies, async (isolated) => {
    const nav = await readBilibiliNav(isolated);
    return run({ isolated, nav });
  });
}

/** 投稿预检：member 域直拉，无需 WBI。 */
export async function fetchBilibiliArchivePre(
  isolated: Session,
): Promise<Record<string, unknown> | null> {
  return cookieSessionJsonGet(
    isolated,
    `${MEMBER_ORIGIN}/x/vupre/web/archive/pre?lang=cn`,
    {
      Referer: "https://member.bilibili.com/york/videoup",
      Origin: MEMBER_ORIGIN,
    },
  );
}
