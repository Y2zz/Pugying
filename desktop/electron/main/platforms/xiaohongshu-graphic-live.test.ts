/**
 * 小红书图文 Cookie 直调实跑：需本机 Server + 可用小红书账号。
 * LIVE_XHS_GRAPHIC=1 npm test -- --run platforms/xiaohongshu-graphic-live.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  XiaohongshuGraphicClient,
  type XiaohongshuGraphicHttpTransport,
} from "./xiaohongshu-graphic-client";
import { runXiaohongshuGraphicPublish } from "./publish-xiaohongshu-graphic";
import type { AgentCookie } from "../protocol";

const LIVE = process.env.LIVE_XHS_GRAPHIC === "1";
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

const nodeTransport: XiaohongshuGraphicHttpTransport = {
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

async function loadXhsAccount(): Promise<{
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
    (row) => row.platform === "xiaohongshu" && row.status === "active",
  );
  if (!account) {
    throw new Error("no active xiaohongshu account");
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

describe.runIf(LIVE)("xiaohongshu graphic cookie live", () => {
  it(
    "uploads images and creates a private note via Cookie HTTP",
    async () => {
      const { accountId, cookies } = await loadXhsAccount();
      readFileSync(IMG1);
      readFileSync(IMG2);

      const client = new XiaohongshuGraphicClient(
        cookies,
        nodeTransport,
        90_000,
      );
      const imageA = await client.uploadImage(IMG1);
      const imageB = await client.uploadImage(IMG2);
      expect(imageA.uri.startsWith("spectrum/")).toBe(true);
      expect(imageB.uri.startsWith("spectrum/")).toBe(true);

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const title = `Cookie图文${stamp.slice(11, 19)}`.slice(0, 20);
      const created = await client.createNote({
        common: {
          type: "normal",
          note_id: "",
          source: JSON.stringify({ type: "web", ids: "" }),
          title,
          desc: "蒲公英 Cookie 直调实跑，仅自己可见。",
          ats: [],
          hash_tag: [],
          privacy_info: { op_type: 1, type: 1, user_ids: [] },
          business_binds: JSON.stringify({
            version: 1,
            bizType: 0,
            notePostTiming: { postTime: null },
            userDeclarationBind: { origin: 0 },
          }),
        },
        image_info: {
          images: [
            {
              file_id: imageA.uri,
              width: imageA.width,
              height: imageA.height,
              metadata: { source: -1, image_template: null },
              stickers: { version: 2, floating: [] },
            },
            {
              file_id: imageB.uri,
              width: imageB.width,
              height: imageB.height,
              metadata: { source: -1, image_template: null },
              stickers: { version: 2, floating: [] },
            },
          ],
        },
        video_info: null,
      });
      expect(created.id).toMatch(/^[a-f0-9]{24}$/);

      mkdirSync(OUT_DIR, { recursive: true });
      const receipt = {
        ok: true,
        accountId,
        platformPostId: created.id,
        platformUrl: `https://www.xiaohongshu.com/explore/${created.id}`,
        title,
        images: [imageA.uri, imageB.uri],
        at: new Date().toISOString(),
      };
      writeFileSync(
        join(OUT_DIR, "xiaohongshu-cookie-live.json"),
        JSON.stringify(receipt, null, 2),
      );
      writeFileSync(
        join(OUT_DIR, `xiaohongshu-cookie-live-${stamp}.json`),
        JSON.stringify(receipt, null, 2),
      );
    },
    120_000,
  );

  it(
    "publishes through runXiaohongshuGraphicPublish",
    async () => {
      const { accountId, cookies } = await loadXhsAccount();
      const progress: string[] = [];
      const result = await runXiaohongshuGraphicPublish({
        payload: {
          requestId: `live-${Date.now()}`,
          targetId: "live-target",
          platform: "xiaohongshu",
          accountId,
          contentType: "graphic",
          title: "队列Cookie图文",
          body: "经 publish 入口实跑，仅自己可见。",
          mediaPaths: [IMG1, IMG2],
          coverPath: "",
          cookies,
          visibility: "private",
          authorDeclaration: "none",
        },
        signal: { cancelled: false },
        onProgress: (p) => {
          progress.push(p.phase);
        },
        createClient: () =>
          new XiaohongshuGraphicClient(cookies, nodeTransport, 90_000),
      });
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^[a-f0-9]{24}$/);
      expect(progress).toContain("submitting");
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        join(OUT_DIR, "xiaohongshu-cookie-live-publish.json"),
        JSON.stringify({ ...result, progress }, null, 2),
      );
    },
    120_000,
  );
});

it("set LIVE_XHS_GRAPHIC=1 to run against a real account", () => {
  expect(LIVE || true).toBe(true);
});
