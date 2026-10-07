import { runBilibiliVideoPublish } from "./publish-bilibili-video";
import type { PlatformPublishStartPayload } from "../publish-protocol";

function fixture() {
  const request = vi.fn(async (path: string) =>
    path.endsWith("/pre")
      ? {
          code: 0,
          data: {
            isLogin: true,
            typelist: [{ name: "生活", children: [{ id: 21, name: "日常" }] }],
          },
        }
      : { code: 0, data: { aid: "123", bvid: "BV1234567890" } },
  );
  const api = {
    request,
    uploadVideo: vi.fn(async () => ({
      vid: "456",
      fileId: "native-file",
      duration: 2,
      width: 640,
      height: 360,
      coverUri: "",
    })),
    uploadImage: vi.fn(async () => ({
      uri: "https://i0.hdslb.com/cover.jpg",
      url: "https://i0.hdslb.com/cover.jpg",
      width: 640,
      height: 360,
      size: 1,
    })),
    dispose: vi.fn(async () => {}),
  };
  const options = {
    payload: {
      requestId: "job",
      targetId: "target",
      platform: "bilibili",
      accountId: "account",
      contentType: "video",
      mediaPath: "/tmp/video.mp4",
      coverPath: "/tmp/cover.png",
      title: "test",
      tags: ["test"],
      visibility: "private",
      cookies: [],
      bilibiliVideoSettings: { partitionId: 21, copyright: 1 },
    } as PlatformPublishStartPayload,
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createSession: vi.fn(async () => api),
  };
  return { options, api };
}

it("publishes uploaded identity with private visibility and returns the official bvid", async () => {
  const { options, api } = fixture();
  expect(await runBilibiliVideoPublish(options)).toMatchObject({
    ok: true,
    platformPostId: "BV1234567890",
  });
  expect(api.request).toHaveBeenLastCalledWith(
    "/x/vu/web/add/v3",
    expect.objectContaining({
      is_only_self: 1,
      web_os: expect.any(Number),
      videos: [
        { filename: "native-file", title: "test", desc: "", cid: 456 },
      ],
    }),
  );
  expect(api.dispose).toHaveBeenCalledOnce();
});

it("rejects missing partition and unsupported declaration before uploading", async () => {
  const { options, api } = fixture();
  options.payload.bilibiliVideoSettings!.partitionId = 0;
  expect(await runBilibiliVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: "invalid_payload",
  });
  expect(api.uploadVideo).not.toHaveBeenCalled();
  options.payload.bilibiliVideoSettings!.partitionId = 21;
  options.payload.authorDeclaration = "ai_generated";
  expect(await runBilibiliVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: "invalid_payload",
  });
  expect(api.uploadVideo).not.toHaveBeenCalled();
});

it("missing post receipt is unknown and never resubmitted", async () => {
  const { options, api } = fixture();
  api.request.mockImplementation(async (path) =>
    path.endsWith("/pre")
      ? {
          code: 0,
          data: {
            isLogin: true,
            typelist: [{ name: "生活", children: [{ id: 21, name: "日常" }] }],
          },
        }
      : ({ code: 0, data: {} } as any),
  );
  expect(await runBilibiliVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: "PUBLISH_RESULT_UNKNOWN",
  });
  expect(api.request).toHaveBeenCalledTimes(2);
  expect(api.dispose).toHaveBeenCalledOnce();
});

it("confirmed receipt survives cancellation after submission", async () => {
  const { options, api } = fixture();
  api.request.mockImplementation(async (path) => {
    if (path.endsWith("/pre")) {
      return {
        code: 0,
        data: {
          isLogin: true,
          typelist: [{ name: "生活", children: [{ id: 21, name: "日常" }] }],
        },
      };
    }
    options.signal.cancelled = true;
    return { code: 0, data: { aid: "123", bvid: "BV1234567890" } };
  });
  expect(await runBilibiliVideoPublish(options)).toMatchObject({ ok: true });
});

it("rejects excessive tag payload before opening or uploading", async () => {
  const { options, api } = fixture();
  options.payload.tags = Array.from(
    { length: 11 },
    (_, index) => `tag${index}`,
  );
  expect(await runBilibiliVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: "invalid_payload",
  });
  expect(options.createSession).not.toHaveBeenCalled();
  expect(api.uploadVideo).not.toHaveBeenCalled();
});
