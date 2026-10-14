import {
  cancelPublishJob,
  isPublishBusy,
  startPublishJob,
  setPublishConcurrency,
} from "./publish-job";
import type { PlatformPublishStartPayload } from "./publish-protocol";

vi.mock("./platforms/publish-douyin-http", () => ({
  runDouyinHttpPublish: vi.fn(async ({ payload, signal, onProgress }) => {
    await Promise.resolve();
    onProgress({
      requestId: payload.requestId,
      targetId: payload.targetId,
      platform: payload.platform,
      phase: "accepted",
    });
    if (signal.cancelled) {
      return {
        requestId: payload.requestId,
        targetId: payload.targetId,
        platform: payload.platform,
        ok: false,
        errorCode: "cancelled",
      };
    }
    onProgress({
      requestId: payload.requestId,
      targetId: payload.targetId,
      platform: payload.platform,
      phase: "done",
    });
    return {
      requestId: payload.requestId,
      targetId: payload.targetId,
      platform: payload.platform,
      ok: true,
      platformPostId: "123",
    };
  }),
}));

vi.mock("./platforms/publish-douyin-graphic", () => ({
  runDouyinGraphicPublish: vi.fn(async ({ payload }) => ({
    requestId: payload.requestId,
    targetId: payload.targetId,
    ok: true,
    platformPostId: "graphic-123",
    platform: payload.platform,
  })),
}));

vi.mock("./platforms/publish-channels-graphic", () => ({
  runChannelsGraphicPublish: vi.fn(async ({ payload }) => ({
    requestId: payload.requestId,
    targetId: payload.targetId,
    ok: true,
    platformPostId: "export/channels-123",
    platform: payload.platform,
  })),
}));

vi.mock("./platforms/publish-channels-video", () => ({
  runChannelsVideoPublish: vi.fn(async ({ payload }) => ({
    requestId: payload.requestId,
    targetId: payload.targetId,
    ok: true,
    platformPostId: "export/channels-video-123",
    platform: payload.platform,
  })),
}));

vi.mock("./platforms/publish-douyin-article", () => ({
  runDouyinArticlePublish: vi.fn(async ({ payload }) => ({
    requestId: payload.requestId,
    targetId: payload.targetId,
    ok: true,
    platformPostId: "123",
    platform: payload.platform,
  })),
}));

function basePayload(
  overrides: Partial<PlatformPublishStartPayload> = {},
): PlatformPublishStartPayload {
  return {
    requestId: "pub-1",
    targetId: "target-1",
    platform: "douyin",
    accountId: "account-1",
    mediaPath: "/tmp/pugying-test/video.mp4",
    coverPath: "/tmp/pugying-test/cover.jpg",
    coverLandscapePath: "/tmp/pugying-test/cover-landscape.jpg",
    title: "测试标题",
    cookies: [{ name: "sessionid", value: "abc" }],
    ...overrides,
  };
}

beforeAll(() => {
  process.env.PUGYING_PUBLISH_STUB = "1";
});

afterEach(() => {
  if (isPublishBusy()) {
    cancelPublishJob("pub-1");
    cancelPublishJob("pub-2");
    cancelPublishJob("pub-3");
  }
  setPublishConcurrency(3);
});

describe("publish-job real adapter routing", () => {
  it("rejects invalid payload", () => {
    const started = startPublishJob({
      payload: basePayload({ title: "" }),
      onProgress: () => undefined,
      onResult: () => undefined,
    });
    expect(started).toEqual({ error: "invalid_payload" });
  });

  it("accepts a video without custom covers", async () => {
    const result = await new Promise<{ ok: boolean }>((resolve) => {
      const started = startPublishJob({
        payload: basePayload({ coverPath: "", coverLandscapePath: "" }),
        onProgress: () => undefined,
        onResult: resolve,
      });
      expect(started).toEqual({ ok: true });
    });
    expect(result.ok).toBe(true);
  });

  it("accepts graphic payload without landscape cover", async () => {
    const result = await new Promise<{ ok: boolean; platformPostId?: string }>(
      (resolve) => {
        const started = startPublishJob({
          payload: basePayload({
            contentType: "graphic",
            mediaPath: undefined,
            mediaPaths: ["/tmp/pugying-test/a.jpg", "/tmp/pugying-test/b.jpg"],
            coverLandscapePath: undefined,
          }),
          onProgress: () => undefined,
          onResult: (r) => {
            resolve(r);
          },
        });
        expect(started).toEqual({ ok: true });
      },
    );
    expect(result.ok).toBe(true);
    expect(result.platformPostId).toBe("graphic-123");
  });

  it("rejects graphic payload without images", () => {
    const started = startPublishJob({
      payload: basePayload({
        contentType: "graphic",
        mediaPath: undefined,
        mediaPaths: [],
        coverLandscapePath: undefined,
      }),
      onProgress: () => undefined,
      onResult: () => undefined,
    });
    expect(started).toEqual({ error: "invalid_payload" });
  });

  it("accepts article payload without images", async () => {
    const result = await new Promise<{ ok: boolean }>((resolve) => {
      const started = startPublishJob({
        payload: basePayload({
          contentType: "article",
          body: "<p>文章正文</p>",
          mediaPath: undefined,
          mediaPaths: [],
          coverLandscapePath: "/tmp/pugying-test/cover-landscape.jpg",
        }),
        onProgress: () => undefined,
        onResult: (r) => {
          resolve(r);
        },
      });
      expect(started).toEqual({ ok: true });
    });
    expect(result.ok).toBe(true);
  });

  it("accepts Channels graphic publish jobs", async () => {
    const result = await new Promise<{ ok: boolean; platformPostId?: string }>(
      (resolve) => {
        const started = startPublishJob({
          payload: basePayload({
            platform: "channels",
            contentType: "graphic",
            mediaPaths: ["/tmp/a.png"],
            mediaPath: undefined,
          }),
          onProgress: () => undefined,
          onResult: (r) => {
            resolve(r);
          },
        });
        expect(started).toEqual({ ok: true });
      },
    );
    expect(result).toMatchObject({
      ok: true,
      platformPostId: "export/channels-123",
    });
  });

  it("accepts Channels video publish jobs", async () => {
    const result = await new Promise<{ ok: boolean; platformPostId?: string }>(
      (resolve) => {
        const started = startPublishJob({
          payload: basePayload({
            platform: "channels",
            contentType: "video",
            title: "短视频对接探测",
          }),
          onProgress: () => undefined,
          onResult: (r) => {
            resolve(r);
          },
        });
        expect(started).toEqual({ ok: true });
      },
    );
    expect(result).toMatchObject({
      ok: true,
      platformPostId: "export/channels-video-123",
    });
  });

  it("prevents overlapping jobs on the same account and emits success", async () => {
    const progress: string[] = [];
    const result = await new Promise<{ ok: boolean; platformPostId?: string }>(
      (resolve) => {
        const started = startPublishJob({
          payload: basePayload(),
          onProgress: (p) => {
            progress.push(p.phase);
          },
          onResult: (r) => {
            resolve(r);
          },
        });
        expect(started).toEqual({ ok: true });
        expect(isPublishBusy()).toBe(true);

        const second = startPublishJob({
          payload: basePayload({ requestId: "pub-2" }),
          onProgress: () => undefined,
          onResult: () => undefined,
        });
        expect(second).toEqual({ error: "busy" });
      },
    );

    expect(result.ok).toBe(true);
    expect(result.platformPostId).toBe("123");
    expect(progress).toContain("accepted");
    expect(progress).toContain("done");
    expect(isPublishBusy()).toBe(false);
  });

  it("cancels an in-flight job", async () => {
    const result = await new Promise<{ ok: boolean; error?: string }>(
      (resolve) => {
        startPublishJob({
          payload: basePayload(),
          onProgress: () => undefined,
          onResult: (r) => {
            resolve(r);
          },
        });
        expect(cancelPublishJob("pub-1")).toBe(true);
      },
    );
    expect(result).toMatchObject({ ok: false, errorCode: "cancelled" });
    expect(isPublishBusy()).toBe(false);
  });
});

it("allows three different accounts at once and rejects a fourth until capacity frees", async () => {
  const finish = vi.fn();
  for (const id of ["1", "2", "3"]) {
    expect(
      startPublishJob({
        payload: basePayload({
          requestId: `pub-${id}`,
          accountId: `account-${id}`,
          targetId: `target-${id}`,
        }),
        onProgress: () => undefined,
        onResult: finish,
      }),
    ).toEqual({ ok: true });
  }
  expect(
    startPublishJob({
      payload: basePayload({ requestId: "pub-4", accountId: "account-4" }),
      onProgress: () => undefined,
      onResult: finish,
    }),
  ).toEqual({ error: "busy" });
  cancelPublishJob("pub-2");
  expect(finish).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(finish).toHaveBeenCalledTimes(3));
  expect(isPublishBusy()).toBe(false);
  cancelPublishJob("pub-1");
  cancelPublishJob("pub-3");
  expect(isPublishBusy()).toBe(false);
});

it.each([true, false])(
  "preserves a committed or uncertain video outcome when cancellation arrives after submission: success=%s",
  async (ok) => {
    const { runDouyinHttpPublish } =
      await import("./platforms/publish-douyin-http");
    let settle: (result: any) => void = () => {};
    vi.mocked(runDouyinHttpPublish).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const finish = vi.fn();
    startPublishJob({
      payload: basePayload(),
      onProgress: vi.fn(),
      onResult: finish,
    });
    await vi.waitFor(() => expect(runDouyinHttpPublish).toHaveBeenCalled());
    expect(cancelPublishJob("pub-1")).toBe(true);
    expect(isPublishBusy()).toBe(true);
    settle({
      requestId: "pub-1",
      targetId: "target-1",
      platform: "douyin",
      ok,
      ...(ok
        ? { platformPostId: "123" }
        : { errorCode: "PUBLISH_RESULT_UNKNOWN" }),
    });
    await vi.waitFor(() => expect(finish).toHaveBeenCalledOnce());
    expect(finish.mock.calls[0][0]).toMatchObject(
      ok
        ? { ok: true, platformPostId: "123" }
        : { ok: false, errorCode: "PUBLISH_RESULT_UNKNOWN" },
    );
    expect(isPublishBusy()).toBe(false);
  },
);

vi.mock("./platforms/publish-bilibili-video", () => ({
  runBilibiliVideoPublish: vi.fn(async ({ payload }) => ({
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
    ok: true,
    platformPostId: "BV1234567890",
  })),
}));

it("routes Bilibili video through its real adapter boundary", async () => {
  const result = await new Promise<any>((resolve) => {
    expect(
      startPublishJob({
        payload: basePayload({
          platform: "bilibili",
          bilibiliVideoSettings: { partitionId: 21, copyright: 1 },
        }),
        onProgress: () => {},
        onResult: resolve,
      }),
    ).toEqual({ ok: true });
  });
  expect(result).toMatchObject({
    ok: true,
    platform: "bilibili",
    platformPostId: "BV1234567890",
  });
});
