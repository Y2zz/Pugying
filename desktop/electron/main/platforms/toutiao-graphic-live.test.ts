/**
 * 头条微头条 联调测试：需本机 Server + 可用头条账号。
 * LIVE_TOUTIAO_GRAPHIC=1 npm test -- --run platforms/toutiao-graphic-live.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  ToutiaoGraphicClient,
  type ToutiaoGraphicHttpTransport,
} from "./toutiao-graphic-client";
import { runToutiaoGraphicPublish } from "./publish-toutiao-graphic";
import type { AgentCookie } from "../protocol";

const LIVE = process.env.LIVE_TOUTIAO_GRAPHIC === "1";
const API = process.env.PUGYING_API_BASE_URL ?? "http://127.0.0.1:3928";
const IMG1 = join(
  process.cwd(),
  "../output/graphic-publish-test/desk-green-1.png",
);
const IMG2 = join(
  process.cwd(),
  "../output/graphic-publish-test/desk-green-2.png",
);
const OUT_DIR = join(process.cwd(), "../output/graphic-publish-test");

const nodeTransport: ToutiaoGraphicHttpTransport = {
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

describe.runIf(LIVE)("toutiao graphic cookie live", () => {
  it(
    "uploads images and creates a micro post via Cookie HTTP",
    async () => {
      const { accountId, cookies } = await loadToutiaoAccount();
      readFileSync(IMG1);
      readFileSync(IMG2);
      const client = new ToutiaoGraphicClient(cookies, nodeTransport, 90_000);
      const imageA = await client.uploadImage(IMG1);
      const imageB = await client.uploadImage(IMG2);
      expect(imageA.uri).toBeTruthy();
      expect(imageB.uri).toBeTruthy();

      const response = await client.createWtt({
        content: "桌上留一点绿\n\n联调测试。",
        image_list: [imageA.uri, imageB.uri],
        pre_upload: 1,
        entrance: "main",
        extra: JSON.stringify({
          info_source: JSON.stringify({
            source_type: 3,
            source_author_uid: "",
          }),
        }),
      });
      mkdirSync(OUT_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const receipt = {
        at: new Date().toISOString(),
        accountId,
        upload: { a: imageA.uri, b: imageB.uri },
        response,
      };
      writeFileSync(
        join(OUT_DIR, `toutiao-cookie-live-${stamp}.json`),
        JSON.stringify(receipt, null, 2),
      );
      writeFileSync(
        join(OUT_DIR, "toutiao-cookie-live.json"),
        JSON.stringify(receipt, null, 2),
      );
      expect(response.code).toBe(0);
      const data = response.data as Record<string, unknown>;
      expect(String(data.thread_id ?? data.threadId ?? "")).toMatch(/^\d+$/);
      await client.dispose();
    },
    180_000,
  );

  it(
    "runToutiaoGraphicPublish end-to-end returns platformPostId",
    async () => {
      const { accountId, cookies } = await loadToutiaoAccount();
      const result = await runToutiaoGraphicPublish({
        payload: {
          requestId: `live-pub-${Date.now()}`,
          targetId: "live-target",
          platform: "toutiao",
          accountId,
          contentType: "graphic",
          title: "给桌面留一点空",
          body: "联调发布。",
          mediaPaths: [IMG1, IMG2],
          coverPath: "",
          cookies,
          visibility: "public",
          authorDeclaration: "ai_generated",
        },
        signal: { cancelled: false },
        onProgress: () => {},
        createClient: async () =>
          new ToutiaoGraphicClient(cookies, nodeTransport, 90_000),
      });
      mkdirSync(OUT_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      writeFileSync(
        join(OUT_DIR, `toutiao-cookie-live-publish-${stamp}.json`),
        JSON.stringify(result, null, 2),
      );
      writeFileSync(
        join(OUT_DIR, "toutiao-cookie-live-publish.json"),
        JSON.stringify(result, null, 2),
      );
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^\d+$/);
    },
    180_000,
  );
});

describe.runIf(!LIVE)("toutiao graphic cookie live (skipped)", () => {
  it("set LIVE_TOUTIAO_GRAPHIC=1 to run against a real account", () => {
    expect(LIVE).toBe(false);
  });
});
