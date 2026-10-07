import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createArticleApiSession } from "./article-api-session";
import type { ArticlePublishOptions } from "./article-api";

const mock = vi.hoisted(() => ({
  windows: [] as any[],
  partitions: [] as string[],
  inject: vi.fn(),
  execute: vi.fn(async () => true as any),
  clearStorage: vi.fn(async () => {}),
  clearCache: vi.fn(async () => {}),
  closeConnections: vi.fn(async () => {}),
  headersReceived: vi.fn(),
  mediaDispose: vi.fn(),
  exposeVideo: vi.fn(),
  createVideoChannel: vi.fn(),
  revokeVideo: vi.fn(),
}));
vi.mock("./publish-media-protocol", () => ({
  createPublishMediaChannel: mock.createVideoChannel,
}));
vi.mock("../auth-browser", () => ({ injectCookies: mock.inject }));
vi.mock("electron", () => ({
  session: {
    fromPartition: (name: string) => {
      mock.partitions.push(name);
      return {
        setPermissionRequestHandler: vi.fn(),
        clearStorageData: mock.clearStorage,
        clearCache: mock.clearCache,
        closeAllConnections: mock.closeConnections,
        webRequest: { onHeadersReceived: mock.headersReceived },
        cookies: {
          get: vi.fn(async () => [{ name: "bili_jct", value: "csrf-token" }]),
        },
      };
    },
  },
  BrowserWindow: class {
    destroyed = false;
    url = "";
    webContents = {
      mainFrame: { executeJavaScript: mock.execute },
      getURL: () => this.url,
      setWindowOpenHandler: vi.fn(),
      once: vi.fn(),
    };
    constructor(readonly options: any) {
      mock.windows.push(this);
    }
    async loadURL(url: string) {
      this.url = url;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
    show = vi.fn();
    hide = vi.fn();
    focus = vi.fn();
  },
}));

function options(): ArticlePublishOptions {
  return {
    payload: {
      requestId: "job",
      targetId: "target",
      platform: "douyin",
      accountId: "account",
      title: "文章",
      coverPath: "",
      contentType: "article",
      cookies: [
        { name: "sessionid", value: "private", domain: ".douyin.com" },
        { name: "subdomain", value: "private", domain: "creator.douyin.com" },
        { name: "fallback", value: "private" },
        { name: "foreign", value: "private", domain: ".bilibili.com" },
        { name: "lookalike", value: "private", domain: "evildouyin.com" },
        {
          name: "expired",
          value: "private",
          domain: ".douyin.com",
          expirationDate: 1,
        },
      ],
    },
    article: { nodes: [], imagePaths: [] },
    onProgress: vi.fn(),
    signal: { cancelled: false },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.windows.length = 0;
  mock.partitions.length = 0;
  mock.execute.mockResolvedValue(true);
});

it("loads the graphic editor in an isolated Cookie session without requiring article nodes", async () => {
  const input = options();
  input.payload.contentType = "graphic";
  const { article: _article, ...transport } = input;
  const api = await createArticleApiSession("douyin", transport);
  expect(mock.windows[0].url).toBe(
    "https://creator.douyin.com/creator-micro/content/post/image",
  );
  expect(mock.partitions[0]).toMatch(/^graphic-api-douyin-/);
  await api.dispose();
});

it("recognizes a login page rendered at the original creator URL and disposes the session", async () => {
  mock.execute.mockResolvedValueOnce("AUTH_EXPIRED");
  await expect(
    createArticleApiSession("douyin", options()),
  ).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  expect(mock.windows[0].destroyed).toBe(true);
});

it("isolates account cookies, drops foreign/expired domains and clears all task storage", async () => {
  const first = await createArticleApiSession("douyin", options());
  const second = await createArticleApiSession("douyin", options());
  expect(new Set(mock.partitions).size).toBe(2);
  expect(
    mock.partitions.every((partition) => !partition.startsWith("persist:")),
  ).toBe(true);
  expect(
    mock.inject.mock.calls[0][1].map((cookie: any) => cookie.name),
  ).toEqual(["sessionid", "subdomain", "fallback"]);
  expect(mock.windows[0].options).toMatchObject({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  await first.dispose();
  await second.dispose();
  expect(mock.windows.every((window) => window.destroyed)).toBe(true);
  expect(mock.clearStorage).toHaveBeenCalledTimes(2);
  expect(mock.clearCache).toHaveBeenCalledTimes(2);
});

it("does not forward account cookies to arbitrary request URLs", async () => {
  const api = await createArticleApiSession("douyin", options());
  await expect(
    api.request("https://other.example/web/api/media/aweme/create_v2/", {}),
  ).rejects.toMatchObject({ code: "invalid_payload" });
  await expect(api.request("/unapproved-endpoint", {})).rejects.toMatchObject({
    code: "invalid_payload",
  });
  expect(mock.execute).toHaveBeenCalledTimes(1);
  await api.dispose();
});

it("allows receipt readback only for one explicit numeric item ID and never posts to the read endpoint", async () => {
  const api = await createArticleApiSession("douyin", options());
  mock.execute.mockResolvedValueOnce({
    ok: true,
    data: { status_code: 0, aweme: { aweme_id: "123" } },
  });
  await expect(
    api.request("/web/api/media/item/info/?item_id=123"),
  ).resolves.toMatchObject({ status_code: 0 });
  await expect(api.request("/web/api/media/item/info/")).rejects.toMatchObject({
    code: "invalid_payload",
  });
  await expect(
    api.request("/web/api/media/item/info/?item_id=123", {}),
  ).rejects.toMatchObject({ code: "invalid_payload" });
  await expect(
    api.request("/web/api/media/item/info/?item_id=123&item_id=456"),
  ).rejects.toMatchObject({ code: "invalid_payload" });
  await api.dispose();
});

it("waits for a commit receipt after cancellation without destroying the in-flight request", async () => {
  vi.useFakeTimers();
  const input = options();
  const api = await createArticleApiSession("douyin", input);
  let settle: (value: any) => void = () => {};
  mock.execute.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  const pending = api.request("/web/api/media/aweme/create_v2/", { item: {} });
  input.signal.cancelled = true;
  await vi.advanceTimersByTimeAsync(300);
  expect(mock.windows[0].destroyed).toBe(false);
  settle({ ok: true, data: { status_code: 0, item_id: "123" } });
  await expect(pending).resolves.toMatchObject({ item_id: "123" });
  await api.dispose();
  vi.useRealTimers();
});

it("classifies a disconnected submit as unknown and never exposes raw error or retries", async () => {
  const api = await createArticleApiSession("douyin", options());
  mock.execute.mockRejectedValueOnce(new Error("Cookie private"));
  await expect(
    api.request("/web/api/media/aweme/create_v2/", { item: {} }),
  ).rejects.toMatchObject({
    code: "PUBLISH_RESULT_UNKNOWN",
    message: "尚未确认发布结果，请先到平台查看",
  });
  expect(mock.execute).toHaveBeenCalledTimes(2);
  await api.dispose();
});

it("keeps an explicit forbidden submit distinct from expired login and unknown results", async () => {
  const api = await createArticleApiSession("douyin", options());
  mock.execute.mockResolvedValueOnce({ ok: false, code: "403" });
  await expect(
    api.request("/web/api/media/aweme/create_v2/", { item: {} }),
  ).rejects.toMatchObject({ code: "PLATFORM_REJECTED" });
  expect(mock.execute).toHaveBeenCalledTimes(2);
  await api.dispose();
});

it("shows native Douyin verification while retaining the in-flight receipt", async () => {
  const input = options();
  const api = await createArticleApiSession("douyin", input);
  let settle: (value: any) => void = () => {};
  mock.execute.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  const pending = api.request("/web/api/media/aweme/create_v2/", { item: {} });
  const callback = vi.fn();
  mock.headersReceived.mock.calls[0][1](
    {
      responseHeaders: {
        "X-Tt-Verify-Passport-Decision": ["private-challenge"],
      },
    },
    callback,
  );
  expect(callback).toHaveBeenCalledWith({});
  expect(mock.windows[0].show).toHaveBeenCalledOnce();
  expect(input.onProgress).toHaveBeenCalledWith(
    expect.objectContaining({ message: "请在平台窗口完成验证" }),
  );
  settle({ ok: true, data: { status_code: 0, item_id: "123" } });
  await expect(pending).resolves.toMatchObject({ item_id: "123" });
  expect(mock.execute).toHaveBeenCalledTimes(2);
  await api.dispose();
});

it("rejects unreadable local media before uploading", async () => {
  const api = await createArticleApiSession("douyin", options());
  await expect(
    api.uploadImage("/tmp/pugying-nonexistent-image.png"),
  ).rejects.toMatchObject({ code: "MEDIA_MISSING" });
  expect(mock.execute).toHaveBeenCalledTimes(1);
  await api.dispose();
});

it("shows official Bilibili verification and re-signs only one explicitly rejected submit", async () => {
  const input = options();
  input.payload.platform = "bilibili";
  input.payload.cookies = [
    { name: "SESSDATA", value: "private", domain: ".bilibili.com" },
  ];
  const api = await createArticleApiSession("bilibili", input);
  let submits = 0;
  mock.execute.mockImplementation(async (script: string) => {
    if (script.includes("riskParams()")) {
      return {
        ok: true,
        data: {
          b_wet: "env-token",
          ...(submits ? { gaia_vtoken: "verified-token" } : {}),
        },
      };
    }
    if (script.includes("request('/x/web-interface/nav')")) {
      return {
        ok: true,
        data: {
          code: 0,
          data: {
            isLogin: true,
            wbi_img: {
              img_url: "https://i.example/7cd084941338484aae1ad9425b84077c.png",
              sub_url: "https://i.example/4932caff0ff746eab6f01bf08b70ac45.png",
            },
          },
        },
      };
    }
    if (script.includes("wbiParams()")) {
      return { ok: true, data: {} };
    }
    if (script.includes("hasVerification()")) {
      return { ok: true, data: true };
    }
    if (script.includes(".verify()")) {
      return { ok: true, data: undefined };
    }
    submits += 1;
    return {
      ok: true,
      data:
        submits === 1
          ? { code: -352 }
          : { code: 0, data: { dyn_id_str: "123" } },
    };
  });
  await expect(
    api.request("/x/dynamic/feed/create/opus", {
      opus_req: { upload_id: "upload-123" },
    }),
  ).resolves.toMatchObject({ code: 0 });
  expect(submits).toBe(2);
  expect(mock.windows[0].show).toHaveBeenCalledOnce();
  expect(mock.windows[0].hide).toHaveBeenCalledOnce();
  expect(
    mock.execute.mock.calls.some(([script]) =>
      script.includes("gaia_vtoken=verified-token"),
    ),
  ).toBe(true);
  await api.dispose();
});

it("loads the video SDK in a unique ephemeral session and streams only the selected local video", async () => {
  const input = options();
  input.payload.contentType = "video";
  const directory = await mkdtemp(
    join(tmpdir(), "pugying-video-session-test-"),
  );
  const path = join(directory, "video.mp4");
  await writeFile(path, "test-only file, no external requests");
  mock.exposeVideo.mockReturnValue("pugying-publish-media://video/token");
  mock.createVideoChannel.mockImplementation(() => {
    expect(mock.windows).toHaveLength(0);
    return {
      expose: mock.exposeVideo,
      revoke: mock.revokeVideo,
      dispose: mock.mediaDispose,
    };
  });
  const api = await createArticleApiSession("douyin", input);
  expect(mock.partitions[0]).toMatch(/^video-api-douyin-/);
  expect(mock.windows[0].url).toBe(
    "https://creator.douyin.com/creator-micro/content/post/video",
  );
  mock.execute.mockResolvedValueOnce({
    ok: true,
    data: {
      vid: "v-real",
      duration: 8,
      width: 720,
      height: 960,
      coverUri: "video/frame",
    },
  });
  try {
    expect(await api.uploadVideo(path)).toMatchObject({ vid: "v-real" });
    expect(mock.exposeVideo).toHaveBeenCalledWith(path);
    expect(mock.execute.mock.calls[1][0]).toContain(
      'fetch("pugying-publish-media://video/token"',
    );
    expect(mock.execute.mock.calls[1][0]).not.toContain("atob(");
    expect(mock.revokeVideo).toHaveBeenCalledOnce();
  } finally {
    await api.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

it("restricts topic lookups to a read-only keyword query and forbids account-wide requests", async () => {
  const api = await createArticleApiSession("douyin", options());
  mock.execute.mockResolvedValueOnce({
    ok: true,
    data: { status_code: 0, sug_list: [] },
  });
  const path =
    "/aweme/v1/search/challengesug/?keyword=day&source=challenge_create&aid=2906";
  await expect(api.request(path)).resolves.toMatchObject({ status_code: 0 });
  for (const invalid of [
    path + "&extra=account",
    "/aweme/v1/search/challengesug/?source=challenge_create&aid=2906",
  ]) {
    await expect(api.request(invalid)).rejects.toMatchObject({
      code: "invalid_payload",
    });
  }
  await expect(api.request(path, {})).rejects.toMatchObject({
    code: "invalid_payload",
  });
  await api.dispose();
});

it("Bilibili video uses its native runtime and origin without article WBI signing", async () => {
  const input = options();
  input.payload.platform = "bilibili";
  input.payload.contentType = "video";
  input.payload.cookies = [
    { name: "SESSDATA", value: "private", domain: ".bilibili.com" },
  ];
  const api = await createArticleApiSession("bilibili", input);
  expect(mock.windows.at(-1).url).toBe(
    "https://member.bilibili.com/york/videoup",
  );
  expect(mock.createVideoChannel.mock.calls.at(-1)?.[1]).toBe(
    "https://member.bilibili.com",
  );
  mock.execute.mockClear();
  mock.execute.mockResolvedValue({
    ok: true,
    data: { code: 0, data: { aid: "1", bvid: "BV1234567890" } },
  });
  await api.request("/x/vu/web/add/v3", { title: "test" });
  expect(mock.execute).toHaveBeenCalledOnce();
  expect(mock.execute.mock.calls[0][0]).not.toContain("riskParams");
  expect(mock.execute.mock.calls[0][0]).not.toContain("w_rid");
  await expect(
    api.request("/x/dynamic/feed/create/opus", {}),
  ).rejects.toMatchObject({ code: "invalid_payload" });
  await api.dispose();
});
