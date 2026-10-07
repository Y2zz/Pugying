import { runXiaohongshuVideoPublish } from "./publish-xiaohongshu-video";

function fixture() {
  const request = vi.fn(async () => ({
    code: 0,
    success: true,
    data: { id: "68e102001234567890abcdef" },
  }));
  const uploadVideo = vi.fn(async () => ({
    vid: "123",
    fileId: "video-file",
    coverUri: "first-frame",
    duration: 2,
    width: 640,
    height: 360,
    originalMetadata: {
      video: { Format: "AVC", Rotation: "0.000" },
      audio: null,
    },
  }));
  const api = {
    request,
    uploadVideo,
    uploadImage: vi.fn(),
    dispose: vi.fn(async () => {}),
  };
  const options = {
    payload: {
      requestId: "job",
      targetId: "target",
      platform: "xiaohongshu",
      accountId: "account",
      contentType: "video",
      title: "视频接口测试",
      body: "测试视频",
      mediaPaths: ["/tmp/test.mp4"],
      coverPath: "",
      cookies: [],
      visibility: "private",
    } as const,
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createSession: vi.fn(async () => api),
  };
  return { api, options, request, uploadVideo };
}

it("submits the video file and track metadata with a private first-frame cover", async () => {
  const { api, options, request } = fixture();
  expect(await runXiaohongshuVideoPublish(options)).toMatchObject({
    ok: true,
    platformPostId: "68e102001234567890abcdef",
  });
  expect(request).toHaveBeenCalledWith(
    "/web_api/sns/v2/note",
    expect.objectContaining({
      image_info: null,
      common: expect.objectContaining({
        type: "video",
        privacy_info: { op_type: 1, type: 1, user_ids: [] },
      }),
      video_info: expect.objectContaining({
        file_id: "video-file",
        format_width: 640,
        cover: expect.objectContaining({
          file_id: "first-frame",
          frame: { ts: 0, is_upload: false, is_user_select: false },
        }),
        segments: expect.objectContaining({
          items: [
            expect.objectContaining({
              duration: 2,
              original_metadata: { Format: "AVC", Rotation: 0 },
            }),
          ],
        }),
      }),
    }),
  );
  expect(api.dispose).toHaveBeenCalledOnce();
});

it("does not resubmit when the platform receipt is missing", async () => {
  const { options, request } = fixture();
  request.mockResolvedValueOnce({ code: 0, success: true, data: { id: "" } });
  expect(await runXiaohongshuVideoPublish(options)).toMatchObject({
    ok: false,
    errorCode: "PUBLISH_RESULT_UNKNOWN",
  });
  expect(request).toHaveBeenCalledOnce();
});

it("rejects incompatible visibility before uploading", async () => {
  const { options, uploadVideo } = fixture();
  expect(
    await runXiaohongshuVideoPublish({
      ...options,
      payload: { ...options.payload, visibility: "friends" },
    }),
  ).toMatchObject({ ok: false, errorCode: "invalid_payload" });
  expect(uploadVideo).not.toHaveBeenCalled();
});

it("does not submit when upload moves the schedule inside the one-hour window", async () => {
  const { options, api, uploadVideo, request } = fixture();
  const initial = Date.now();
  const now = vi.spyOn(Date, "now").mockReturnValue(initial);
  const upload = uploadVideo.getMockImplementation()!;
  uploadVideo.mockImplementation(async () => {
    now.mockReturnValue(initial + 600000);
    return upload();
  });
  try {
    const result = await runXiaohongshuVideoPublish({
      ...options,
      payload: {
        ...options.payload,
        scheduledAt: new Date(initial + 3900000).toISOString(),
      },
    });
    expect(result).toMatchObject({ ok: false, errorCode: "invalid_payload" });
    expect(request).not.toHaveBeenCalled();
    expect(api.dispose).toHaveBeenCalledOnce();
  } finally {
    now.mockRestore();
  }
});
