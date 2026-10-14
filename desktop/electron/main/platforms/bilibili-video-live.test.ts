/**
 * B 站短视频 联调测试：需本机 Server + 可用 B 站账号。
 * LIVE_BILI_VIDEO=1 npm test -- --run platforms/bilibili-video-live.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentCookie } from "../protocol";
import {
  BilibiliVideoClient,
  type BilibiliVideoHttpTransport,
} from "./bilibili-video-client";
import { runBilibiliVideoPublish } from "./publish-bilibili-video";

const LIVE = process.env.LIVE_BILI_VIDEO === "1";
const API = process.env.PUGYING_API_BASE_URL ?? "http://127.0.0.1:3928";
const VIDEO = join(
  process.cwd(),
  "../output/video-publish-test/upload-probe.mp4",
);
const COVER = join(
  process.cwd(),
  "../output/video-publish-test/cover-landscape.jpg",
);
const OUT_DIR = join(process.cwd(), "../output/video-publish-test");

const nodeTransport: BilibiliVideoHttpTransport = {
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

async function loadAccount(): Promise<{
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

describe.runIf(LIVE)("bilibili video cookie live", () => {
  it(
    "uploads via UPOS and creates a private archive",
    async () => {
      const { accountId, cookies } = await loadAccount();
      readFileSync(VIDEO);
      readFileSync(COVER);
      const result = await runBilibiliVideoPublish({
        payload: {
          requestId: `live-bili-video-${Date.now()}`,
          targetId: "live-bili-video",
          platform: "bilibili",
          accountId,
          contentType: "video",
          mediaPath: VIDEO,
          coverPath: COVER,
          title: "Cookie视频探针",
          body: "仅自己可见联调",
          tags: ["日常"],
          cookies,
          visibility: "private",
          bilibiliVideoSettings: { partitionId: 21, copyright: 1 },
        },
        signal: { cancelled: false },
        onProgress: () => {},
        createSession: async () =>
          new BilibiliVideoClient(cookies, nodeTransport, 120_000),
      });
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        join(OUT_DIR, "bilibili-video-cookie-live.json"),
        JSON.stringify(
          { ...result, accountId, at: new Date().toISOString() },
          null,
          2,
        ),
      );
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^BV[0-9A-Za-z]{10}$/);
    },
    300_000,
  );
});

it("set LIVE_BILI_VIDEO=1 to run against a real account", () => {
  expect(LIVE || true).toBe(true);
});
