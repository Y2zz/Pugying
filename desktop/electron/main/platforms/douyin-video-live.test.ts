/**
 * 抖音短视频 联调测试：需本机 Server + 可用抖音账号。
 * LIVE_DOUYIN_VIDEO=1 npm test -- --run platforms/douyin-video-live.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentCookie } from "../protocol";
import {
  DouyinGraphicClient,
  type DouyinGraphicHttpTransport,
} from "./douyin-graphic-client";
import { runDouyinHttpPublish } from "./publish-douyin-http";

const LIVE = process.env.LIVE_DOUYIN_VIDEO === "1";
const API = process.env.PUGYING_API_BASE_URL ?? "http://127.0.0.1:3928";
const VIDEO = join(
  process.cwd(),
  "../output/video-publish-test/upload-probe.mp4",
);
const OUT_DIR = join(process.cwd(), "../output/video-publish-test");

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
  const body = (await credRes.json()) as { cookies?: AgentCookie[] };
  if (!body.cookies?.length) {
    throw new Error("empty cookies");
  }
  return { accountId: account.id, cookies: body.cookies };
}

describe.runIf(LIVE)("douyin video cookie live", () => {
  it(
    "uploads VOD and creates a private short video",
    async () => {
      const { accountId, cookies } = await loadDouyinAccount();
      readFileSync(VIDEO);
      const result = await runDouyinHttpPublish({
        payload: {
          requestId: `live-video-${Date.now()}`,
          targetId: "live-video",
          platform: "douyin",
          accountId,
          contentType: "video",
          mediaPath: VIDEO,
          title: "Cookie视频探针",
          body: "仅自己可见联调",
          cookies,
          visibility: "private",
          allowDownload: false,
        },
        signal: { cancelled: false },
        onProgress: () => {},
        createSession: async () =>
          new DouyinGraphicClient(cookies, nodeTransport, 90_000),
      });
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^\d+$/);
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        join(OUT_DIR, "douyin-video-cookie-live.json"),
        JSON.stringify(
          { ...result, accountId, at: new Date().toISOString() },
          null,
          2,
        ),
      );
    },
    300_000,
  );
});

it("set LIVE_DOUYIN_VIDEO=1 to run against a real account", () => {
  expect(LIVE || true).toBe(true);
});
