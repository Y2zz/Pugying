/**
 * 头条短视频 Cookie 直调实跑：需本机 Server + 可用头条账号。
 * LIVE_TOUTIAO_VIDEO=1 npm test -- --run platforms/toutiao-video-live.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentCookie } from "../protocol";
import {
  ToutiaoVideoClient,
  type ToutiaoVideoHttpTransport,
} from "./toutiao-video-client";
import { runToutiaoVideoPublish } from "./publish-toutiao-video";

const LIVE = process.env.LIVE_TOUTIAO_VIDEO === "1";
const API = process.env.PUGYING_API_BASE_URL ?? "http://127.0.0.1:3928";
const VIDEO = join(
  process.cwd(),
  "../output/video-publish-test/upload-probe.mp4",
);
const COVER = join(
  process.cwd(),
  "../output/graphic-publish-test/desk-green-1.png",
);
const OUT_DIR = join(process.cwd(), "../output/video-publish-test");

const nodeTransport: ToutiaoVideoHttpTransport = {
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
        setCookie:
          typeof response.headers.getSetCookie === "function"
            ? response.headers.getSetCookie()
            : [],
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

describe.runIf(LIVE)("toutiao video cookie live", () => {
  it(
    "uploads via VAS object path and creates a private video",
    async () => {
      const { accountId, cookies } = await loadToutiaoAccount();
      readFileSync(VIDEO);
      readFileSync(COVER);
      const result = await runToutiaoVideoPublish({
        payload: {
          requestId: `live-tt-video-${Date.now()}`,
          targetId: "live-tt-video",
          platform: "toutiao",
          accountId,
          contentType: "video",
          mediaPath: VIDEO,
          coverPath: COVER,
          title: "Cookie视频探针",
          body: "仅自己可见实跑",
          cookies,
          visibility: "private",
        },
        signal: { cancelled: false },
        onProgress: () => {},
        createSession: async () =>
          new ToutiaoVideoClient(cookies, nodeTransport, 90_000),
      });
      expect(result.ok).toBe(true);
      expect(result.platformPostId).toMatch(/^\d+$/);
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        join(OUT_DIR, "toutiao-video-cookie-live.json"),
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

it("set LIVE_TOUTIAO_VIDEO=1 to run against a real account", () => {
  expect(LIVE || true).toBe(true);
});
