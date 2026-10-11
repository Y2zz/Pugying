/**
 * 小红书短视频 Cookie 直调实跑：需本机 Server + 可用小红书账号。
 * LIVE_XHS_VIDEO=1 npm test -- --run platforms/xiaohongshu-video-live.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentCookie } from "../protocol";
import {
  XiaohongshuVideoClient,
  type XiaohongshuVideoHttpTransport,
} from "./xiaohongshu-video-client";
import { runXiaohongshuVideoPublish } from "./publish-xiaohongshu-video";

const LIVE = process.env.LIVE_XHS_VIDEO === "1";
const API = process.env.PUGYING_API_BASE_URL ?? "http://127.0.0.1:3928";
const VIDEO = join(
  process.cwd(),
  "../output/video-publish-test/upload-probe.mp4",
);
const OUT_DIR = join(process.cwd(), "../output/video-publish-test");

const nodeTransport: XiaohongshuVideoHttpTransport = {
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
  const body = (await credRes.json()) as { cookies?: AgentCookie[] };
  if (!body.cookies?.length) {
    throw new Error("empty cookies");
  }
  return { accountId: account.id, cookies: body.cookies };
}

describe.runIf(LIVE)("xiaohongshu video cookie live", () => {
  it(
    "uploads via ROS and creates a private video note",
    async () => {
      const { accountId, cookies } = await loadAccount();
      readFileSync(VIDEO);
      const result = await runXiaohongshuVideoPublish({
        payload: {
          requestId: `live-xhs-video-${Date.now()}`,
          targetId: "live-xhs-video",
          platform: "xiaohongshu",
          accountId,
          contentType: "video",
          mediaPath: VIDEO,
          title: "Cookie视频探针",
          body: "仅自己可见实跑",
          cookies,
          visibility: "private",
        },
        signal: { cancelled: false },
        onProgress: () => {},
        createSession: async () =>
          new XiaohongshuVideoClient(cookies, nodeTransport, 90_000),
      });
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^[a-f0-9]{24}$/);
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        join(OUT_DIR, "xiaohongshu-video-cookie-live.json"),
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

it("set LIVE_XHS_VIDEO=1 to run against a real account", () => {
  expect(LIVE || true).toBe(true);
});
