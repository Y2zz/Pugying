import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { XIAOHONGSHU_VIDEO_RUNTIME } from "./xiaohongshu-video-runtime";

async function prepare(lazyConverter = false) {
  const callbacks: Record<string, (value: unknown) => void> = {};
  const video = {
    Format: "AVC",
    Duration: "8",
    Width: "1920",
    Height: "1080",
    Rotation: "90",
  };
  const uploaded: { fileId: string; videoId?: string | number } = {
    fileId: "video/original",
    videoId: "123456789",
  };
  const uploader = {
    onProgress: vi.fn((callback) => {
      callbacks.progress = callback;
    }),
    onInstanceCreated: vi.fn((callback) => {
      callbacks.instance = callback;
    }),
    onTaskReady: vi.fn((callback) => {
      callbacks.task = callback;
    }),
    upload: vi.fn(async () => {
      callbacks.instance({});
      callbacks.task("task-one");
      callbacks.progress({ percent: 0.5 });
      return uploaded;
    }),
    generatorID: vi.fn(async () => "987654321"),
    cancel: vi.fn(),
  };
  const media = {
    queryVideoInfo: vi.fn(async () => ({ media: { track: [video] } })),
    queryVideoTrack: vi.fn(() => video),
    queryAudioTrack: vi.fn(() => null),
    queryGeneralTrack: vi.fn(() => ({ Duration: "8" })),
    queryTranscode: vi
      .fn()
      .mockResolvedValueOnce({ hasFirstFrame: false })
      .mockResolvedValue({
        hasFirstFrame: true,
        firstFrameFileId: "image/first-frame",
        hasTranscodeVideo: true,
        transcodeVideoFileId: "video/converted",
      }),
  };
  const createUploader = vi.fn(() => uploader);
  const bootstrap = vi.fn(async () => {});
  const getToken = vi.fn();
  const modules = {
    21069: { LV: { get: vi.fn(), post: vi.fn() } },
    69517: { d9: { post: vi.fn() } },
    67490: { t$: { media, uploader: { createUploader } }, Nw: bootstrap },
    9712: { gf: getToken },
    43257: { toSnakeCase: vi.fn((data) => data) },
  };
  const converter = modules[43257];
  if (lazyConverter) {
    delete (modules as Partial<typeof modules>)[43257];
  }
  const loadChunk = vi.fn(async (id: string) => {
    if (id === "3330") {
      modules[43257] = converter;
    }
  });
  const require = Object.assign((id: number) => modules[id], {
    m: modules,
    e: loadChunk,
  });
  const window: any = {
    webpackChunkugc: { push: ([, , callback]: any[]) => callback(require) },
  };
  expect(
    await runInNewContext(XIAOHONGSHU_VIDEO_RUNTIME, {
      window,
      crypto: webcrypto,
      location: { hostname: "creator.xiaohongshu.com" },
      setTimeout: (callback: () => void) => callback(),
    }),
  ).toBe(true);
  return {
    window,
    video,
    uploaded,
    uploader,
    media,
    createUploader,
    bootstrap,
    getToken,
    loadChunk,
  };
}

it("uses the official chunk uploader and waits for the first frame, retaining rotated dimensions", async () => {
  const state = await prepare();
  const file = { size: 1024 };
  const result = await state.window.__pugyingArticleApi.uploadVideo(file);
  expect(result).toMatchObject({
    vid: "123456789",
    duration: 8,
    width: 1080,
    height: 1920,
    coverUri: "image/first-frame",
    fileId: "video/original",
    originalMetadata: { video: state.video, audio: null },
  });
  expect(state.bootstrap).toHaveBeenCalledOnce();
  expect(state.createUploader).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      scene: "video",
      getToken: state.getToken,
    }),
  );
  expect(state.uploader.upload).toHaveBeenCalledWith(file);
  expect(state.media.queryTranscode).toHaveBeenCalledTimes(2);
  expect(state.media.queryTranscode).toHaveBeenCalledWith(
    "123456789",
    false,
    undefined,
  );
  expect(state.window.__pugyingVideoProgress).toBe(100);
  expect(state.uploader.cancel).toHaveBeenCalledWith({}, "task-one");
});

it("uses the processed video file when the original codec requires conversion", async () => {
  const state = await prepare();
  state.video.Format = "HEVC";
  const result = await state.window.__pugyingArticleApi.uploadVideo({});
  expect(result.fileId).toBe("video/converted");
  expect(state.createUploader).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ scene: "preview_video" }),
  );
  expect(state.media.queryTranscode).toHaveBeenCalledWith(
    "123456789",
    true,
    "14",
  );
});

it("generates an absent video ID and rejects a rounded numeric ID before processing", async () => {
  const state = await prepare();
  delete state.uploaded.videoId;
  expect((await state.window.__pugyingArticleApi.uploadVideo({})).vid).toBe(
    "987654321",
  );
  expect(state.uploader.generatorID).toHaveBeenCalledWith(
    "video/original",
    "217",
  );
  state.uploaded.videoId = Number.MAX_SAFE_INTEGER + 1;
  state.media.queryTranscode.mockClear();
  await expect(
    state.window.__pugyingArticleApi.uploadVideo({}),
  ).rejects.toMatchObject({ code: "ARTICLE_API_CHANGED" });
  expect(state.media.queryTranscode).not.toHaveBeenCalled();
});

it("rejects videos over four hours before requesting upload credentials", async () => {
  const state = await prepare();
  state.video.Duration = "14401";
  await expect(
    state.window.__pugyingArticleApi.uploadVideo({}),
  ).rejects.toMatchObject({ code: "VIDEO_UNSUPPORTED" });
  expect(state.createUploader).not.toHaveBeenCalled();
  expect(state.uploader.upload).not.toHaveBeenCalled();
});

it("loads the official editor dependencies before using the field converter", async () => {
  const state = await prepare(true);
  expect(state.loadChunk.mock.calls.map(([id]) => id)).toEqual([
    "3330",
    "1314",
    "2100",
  ]);
  expect(state.bootstrap).toHaveBeenCalledOnce();
});
