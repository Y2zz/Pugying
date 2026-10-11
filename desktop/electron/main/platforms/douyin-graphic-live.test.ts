/**
 * 抖音图文 Cookie 直调实跑：需本机 Server + 可用抖音账号。
 * LIVE_DOUYIN_GRAPHIC=1 npm test -- --run platforms/douyin-graphic-live.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  DouyinGraphicClient,
  type DouyinGraphicHttpTransport,
} from "./douyin-graphic-client";
import { signDouyinCreatorUrl } from "./douyin-bdms-sign";
import { runDouyinGraphicPublish } from "./publish-douyin-graphic";
import type { AgentCookie } from "../protocol";

const LIVE = process.env.LIVE_DOUYIN_GRAPHIC === "1";
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

const nodeTransport: DouyinGraphicHttpTransport = {
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

async function loadDouyinAccount(): Promise<{
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
    displayName?: string;
  }>;
  const account = accounts.find(
    (row) => row.platform === "douyin" && row.status === "active",
  );
  if (!account) {
    throw new Error("no active douyin account");
  }
  const credRes = await fetch(
    `${API}/platform-accounts/${encodeURIComponent(account.id)}/credentials`,
    { method: "POST" },
  );
  if (!credRes.ok) {
    throw new Error(`credentials HTTP ${credRes.status}`);
  }
  const body = (await credRes.json()) as {
    cookies?: AgentCookie[];
  };
  if (!body.cookies?.length) {
    throw new Error("empty cookies");
  }
  return { accountId: account.id, cookies: body.cookies };
}

describe.runIf(LIVE)("douyin graphic cookie live", () => {
  it(
    "uploads images and creates a private note via Cookie HTTP",
    async () => {
      const { accountId, cookies } = await loadDouyinAccount();
      readFileSync(IMG1);
      readFileSync(IMG2);

      const client = new DouyinGraphicClient(
        cookies,
        nodeTransport,
        90_000,
        signDouyinCreatorUrl,
      );
      await client.prepare();
      const imageA = await client.uploadImage(IMG1);
      const imageB = await client.uploadImage(IMG2);
      expect(imageA.uri).toBeTruthy();
      expect(imageB.uri).toBeTruthy();
      expect(imageA.width).toBeGreaterThan(0);
      expect(imageB.width).toBeGreaterThan(0);

      const creationId = `live-${Date.now()}`;
      const title = "桌上留一点绿";
      const body = "Cookie直调实跑，仅自己可见。";
      const response = await client.createAweme({
        common: {
          media_type: 2,
          creation_id: creationId,
          text: `${title}。${body}`,
          text_extra: JSON.stringify([
            {
              start: 0,
              end: title.length,
              hashtag_id: 0,
              hashtag_name: "",
              type: 7,
            },
            {
              start: title.length,
              end: title.length + 1,
              hashtag_id: 0,
              hashtag_name: "",
              type: 8,
            },
          ]),
          images: [
            {
              uri: imageA.uri,
              width: imageA.width,
              height: imageA.height,
            },
            {
              uri: imageB.uri,
              width: imageB.width,
              height: imageB.height,
            },
          ],
          visibility_type: 1,
          download: 0,
          timing: -1,
        },
        cover: { poster: imageA.uri },
        declare: {
          user_declare_info: JSON.stringify({ choose_value: "aigc" }),
        },
      });

      mkdirSync(OUT_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const receipt = {
        at: new Date().toISOString(),
        accountId,
        creationId,
        upload: { a: imageA.uri, b: imageB.uri },
        response,
      };
      // 带时间戳留档，避免后续失败重跑覆盖成功凭证
      writeFileSync(
        join(OUT_DIR, `douyin-cookie-live-${stamp}.json`),
        JSON.stringify(receipt, null, 2),
      );
      writeFileSync(
        join(OUT_DIR, "douyin-cookie-live.json"),
        JSON.stringify(receipt, null, 2),
      );

      expect(response.status_code).toBe(0);
      expect(String(response.item_id ?? "")).toMatch(/^\d+$/);
      await client.dispose();
    },
    180_000,
  );

  it(
    "runDouyinGraphicPublish end-to-end returns platformPostId",
    async () => {
      const { accountId, cookies } = await loadDouyinAccount();
      const result = await runDouyinGraphicPublish({
        payload: {
          requestId: `live-pub-${Date.now()}`,
          targetId: "live-target",
          platform: "douyin",
          accountId,
          contentType: "graphic",
          title: "给桌面留一点空",
          body: "端到端 Cookie 直调实跑。",
          mediaPaths: [IMG1, IMG2],
          coverPath: IMG1,
          cookies,
          visibility: "private",
          allowDownload: false,
          authorDeclaration: "ai_generated",
        },
        signal: { cancelled: false },
        onProgress: () => {},
        createClient: async () =>
          new DouyinGraphicClient(
            cookies,
            nodeTransport,
            90_000,
            signDouyinCreatorUrl,
          ),
      });
      mkdirSync(OUT_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      writeFileSync(
        join(OUT_DIR, `douyin-cookie-live-publish-${stamp}.json`),
        JSON.stringify(result, null, 2),
      );
      writeFileSync(
        join(OUT_DIR, "douyin-cookie-live-publish.json"),
        JSON.stringify(result, null, 2),
      );
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^\d+$/);
    },
    180_000,
  );
});

describe.runIf(!LIVE)("douyin graphic cookie live (skipped)", () => {
  it("set LIVE_DOUYIN_GRAPHIC=1 to run against a real account", () => {
    expect(LIVE).toBe(false);
  });
});
