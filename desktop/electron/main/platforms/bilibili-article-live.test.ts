/**
 * B 站专栏 联调测试：需本机 Server + 可用 B 站账号。
 * LIVE_BILIBILI_ARTICLE=1 npm test -- --run platforms/bilibili-article-live.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareArticleDocument } from "../article-publish-format";
import type { AgentCookie } from "../protocol";
import {
  BilibiliArticleClient,
  type BilibiliArticleHttpTransport,
} from "./bilibili-article-client";
import { runBilibiliArticlePublish } from "./publish-bilibili-article";

const LIVE = process.env.LIVE_BILIBILI_ARTICLE === "1";
const API = process.env.PUGYING_API_BASE_URL ?? "http://127.0.0.1:3928";
const IMG = join(
  process.cwd(),
  "../output/graphic-publish-test/desk-green-1.png",
);
const OUT_DIR = join(process.cwd(), "../output/graphic-publish-test");

const nodeTransport: BilibiliArticleHttpTransport = {
  async request(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body as BodyInit | undefined,
        signal: controller.signal,
        redirect: "error",
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

async function loadBilibiliAccount(): Promise<{
  accountId: string;
  cookies: AgentCookie[];
}> {
  const listRes = await fetch(`${API}/platform-accounts`);
  if (!listRes.ok) {
    throw new Error(`list accounts HTTP ${listRes.status}`);
  }
  const accounts = (await listRes.json()) as Array<{
    id: string;
    platform: string;
    status: string;
  }>;
  const account = accounts.find(
    (row) => row.platform === "bilibili" && row.status === "active",
  );
  if (!account) {
    throw new Error("no active bilibili account");
  }
  const credRes = await fetch(
    `${API}/platform-accounts/${encodeURIComponent(account.id)}/credentials`,
    { method: "POST" },
  );
  if (!credRes.ok) {
    throw new Error(`credentials HTTP ${credRes.status}`);
  }
  const body = (await credRes.json()) as { cookies?: AgentCookie[] };
  if (!body.cookies?.length) {
    throw new Error("empty cookies");
  }
  return { accountId: account.id, cookies: body.cookies };
}

describe.runIf(LIVE)("bilibili article cookie live", () => {
  it(
    "uploads and creates a private opus article via Cookie HTTP",
    async () => {
      const { accountId, cookies } = await loadBilibiliAccount();
      readFileSync(IMG);
      const stamp = Date.now().toString().slice(-6);
      const bodyHtml = `<p>${"一阵风里的蒲公英，轻轻落在窗台。".repeat(10)}</p><figure data-article-image><img data-local-path="${IMG}" src="file://${IMG}" alt="绿"><figcaption>窗边一点绿</figcaption></figure><p>${"继续写下去，让正文足够长。".repeat(8)}</p>`;
      const article = prepareArticleDocument(bodyHtml, [IMG]);
      const result = await runBilibiliArticlePublish({
        payload: {
          requestId: `live-bili-article-${Date.now()}`,
          targetId: "live-bili-article",
          platform: "bilibili",
          accountId,
          contentType: "article",
          title: `Cookie专栏${stamp}`,
          coverPath: "",
          cookies,
          visibility: "private",
          articleSettings: { customCover: false, original: false },
        },
        article,
        signal: { cancelled: false },
        onProgress: () => {},
        createSession: async () =>
          new BilibiliArticleClient(cookies, nodeTransport, 90_000),
      });
      // 本日额度用尽时仍视为 Cookie 路径可用（探针已取得 dyn_id）；有额度则要求成功
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        join(OUT_DIR, "bilibili-article-cookie-live.json"),
        JSON.stringify(
          { ...result, accountId, at: new Date().toISOString() },
          null,
          2,
        ),
      );
      if (result.errorCode === "ARTICLE_PUBLISH_LIMIT_REACHED") {
        expect(result.ok).toBe(false);
        return;
      }
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^\d+$/);
    },
    180_000,
  );
});

it("set LIVE_BILIBILI_ARTICLE=1 to run against a real account", () => {
  expect(LIVE || true).toBe(true);
});
