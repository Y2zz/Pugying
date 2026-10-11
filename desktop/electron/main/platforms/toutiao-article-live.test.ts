/**
 * 头条文章 Cookie 直调实跑：需本机 Server + 可用头条账号。
 * LIVE_TOUTIAO_ARTICLE=1 npm test -- --run platforms/toutiao-article-live.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareArticleDocument } from "../article-publish-format";
import type { AgentCookie } from "../protocol";
import {
  ToutiaoArticleClient,
  type ToutiaoArticleHttpTransport,
} from "./toutiao-article-client";
import { runToutiaoArticlePublish } from "./publish-toutiao-article";

const LIVE = process.env.LIVE_TOUTIAO_ARTICLE === "1";
const API = process.env.PUGYING_API_BASE_URL ?? "http://127.0.0.1:3928";
const IMG = join(
  process.cwd(),
  "../output/graphic-publish-test/desk-green-1.png",
);
const OUT_DIR = join(process.cwd(), "../output/graphic-publish-test");

const nodeTransport: ToutiaoArticleHttpTransport = {
  async request(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
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

async function loadToutiaoAccount(): Promise<{
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
    (row) => row.platform === "toutiao" && row.status === "active",
  );
  if (!account) {
    throw new Error("no active toutiao account");
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

describe.runIf(LIVE)("toutiao article cookie live", () => {
  it(
    "uploads and publishes a private-ish article via Cookie HTTP",
    async () => {
      const { accountId, cookies } = await loadToutiaoAccount();
      readFileSync(IMG);
      const bodyHtml = `<p>${"一阵风里的蒲公英，轻轻落在窗台。".repeat(10)}</p><figure data-article-image><img data-local-path="${IMG}" src="file://${IMG}" alt="绿"><figcaption>窗边一点绿</figcaption></figure><p>${"继续写下去，让正文足够长。".repeat(8)}</p>`;
      const article = prepareArticleDocument(bodyHtml, [IMG]);
      const result = await runToutiaoArticlePublish({
        payload: {
          requestId: `live-tt-article-${Date.now()}`,
          targetId: "live-tt-article",
          platform: "toutiao",
          accountId,
          contentType: "article",
          title: "Cookie文章实跑",
          coverPath: IMG,
          cookies,
          articleSettings: {
            coverMode: "single",
            syncToMicroPost: false,
          },
        },
        article,
        signal: { cancelled: false },
        onProgress: () => {},
        createSession: async () =>
          new ToutiaoArticleClient(cookies, nodeTransport, 90_000),
      });
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^\d+$/);
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        join(OUT_DIR, "toutiao-article-cookie-live.json"),
        JSON.stringify(
          { ...result, accountId, at: new Date().toISOString() },
          null,
          2,
        ),
      );
    },
    180_000,
  );
});

it("set LIVE_TOUTIAO_ARTICLE=1 to run against a real account", () => {
  expect(LIVE || true).toBe(true);
});
