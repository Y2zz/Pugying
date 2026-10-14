import { runToutiaoVideoPublish } from "./publish-toutiao-video";

function fixture() {
  const request = vi.fn(
    async (path: string, _data?: Record<string, unknown>) =>
      path.endsWith("GetPublishAuth")
        ? {
            status: 0,
            data: {
              authorConfig: {
                XgVideoTitleLenMin: 5,
                XgVideoTitleLenMax: 30,
                TtVideoTitleLenMin: 0,
                TtVideoTitleLenMax: 30,
              },
            },
          }
        : { status: 0, data: { Code: 0, ItemId: "7694000000000000001" } },
  );
  const api = {
    request,
    uploadVideo: vi.fn(async () => ({
      vid: "v123abc",
      duration: 2,
      width: 640,
      height: 360,
      coverUri: "",
    })),
    uploadImage: vi.fn(async () => ({
      uri: "remote-cover",
      url: "https://p9-xg.bytecdn.cn/origin/remote-cover",
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
      platform: "toutiao",
      accountId: "account",
      contentType: "video",
      title: "视频接口测试",
      body: "测试视频",
      mediaPaths: ["/tmp/test.mp4"],
      coverPath: "/tmp/portrait.png",
      coverLandscapePath: "/tmp/landscape.png",
      cookies: [],
      visibility: "private",
      authorDeclaration: "ai_generated",
    } as const,
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createSession: vi.fn(async () => api),
  };
  return { options, api, request };
}

it("submits a private video with landscape cover and an explicit AI declaration", async () => {
  const { options, api, request } = fixture();
  expect(await runToutiaoVideoPublish(options)).toMatchObject({
    ok: true,
    platformPostId: "7694000000000000001",
  });
  expect(api.uploadImage).toHaveBeenCalledWith("/tmp/landscape.png");
  expect(request).toHaveBeenLastCalledWith(
    "/xigua/api/upload/PublishVideo",
    expect.objectContaining({
      Title: "视频接口测试",
      VideoType: 3,
      PublishType: 1,
      HideInfo: { HideType: 1 },
      ComplianceInfo: { IsAIGC: true, ComplianceType: 3 },
      VideoInfo: expect.objectContaining({
        Vid: "v123abc",
        VName: "test.mp4",
        ThumbUri: "remote-cover",
        Duration: 2,
      }),
    }),
  );
  expect(api.dispose).toHaveBeenCalledOnce();
});

it("requires a confirmed business success and never resubmits a missing receipt", async () => {
  const { options, request } = fixture();
  request.mockResolvedValueOnce({
    status: 0,
    data: { authorConfig: { XgVideoTitleLenMin: 5, XgVideoTitleLenMax: 30 } },
  });
  request.mockResolvedValueOnce({ status: 0, data: { Code: 0, ItemId: "" } });
  expect(await runToutiaoVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: "PUBLISH_RESULT_UNKNOWN",
  });
  expect(
    request.mock.calls.filter(([path]) => path.endsWith("PublishVideo")),
  ).toHaveLength(1);
});

it("stops before upload when the account permission request is refused", async () => {
  const { options, api, request } = fixture();
  request.mockResolvedValueOnce({ status: -12, data: {} });
  expect(await runToutiaoVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: "AUTH_EXPIRED",
  });
  expect(api.uploadVideo).not.toHaveBeenCalled();
});

it("maps a scheduled post to seconds and the timer publish type", async () => {
  const { options, request } = fixture();
  const time = Date.now() + 86400000;
  expect(
    await runToutiaoVideoPublish({
      ...options,
      payload: {
        ...options.payload,
        scheduledAt: new Date(time).toISOString(),
      },
    }),
  ).toMatchObject({ ok: true });
  expect(request).toHaveBeenLastCalledWith(
    "/xigua/api/upload/PublishVideo",
    expect.objectContaining({
      PublishType: 2,
      TimerTime: Math.floor(time / 1000),
    }),
  );
});

it("does not submit a schedule that expired during upload", async () => {
  const { options, api } = fixture();
  const initial = Date.now();
  const now = vi.spyOn(Date, "now").mockReturnValue(initial);
  const upload = api.uploadVideo.getMockImplementation()!;
  api.uploadVideo.mockImplementation(async () => {
    now.mockReturnValue(initial + 120000);
    return upload();
  });
  try {
    const result = await runToutiaoVideoPublish({
      ...options,
      payload: {
        ...options.payload,
        scheduledAt: new Date(initial + 60000).toISOString(),
      },
    });
    expect(result).toMatchObject({ ok: false, errorCode: "invalid_payload" });
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.dispose).toHaveBeenCalledOnce();
  } finally {
    now.mockRestore();
  }
});
