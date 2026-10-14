import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import {
  BILIBILI_VIDEO_UPLOAD_RUNTIME,
  BILIBILI_VIDEO_RUNTIME,
} from "./bilibili-video-runtime";

function fixture(client?: Record<string, unknown>) {
  const events: Record<string, (event: unknown) => void> = {};
  const startUpload = vi.fn(async () => undefined);
  const Slice = vi.fn(function (this: any, file: unknown, options: unknown) {
    this.file = file;
    this.options = options;
    this.cid = "";
    this.filename = "";
    this.on = (name: string, callback: (event: unknown) => void) => {
      events[name] = callback;
    };
    this.startUpload = startUpload;
  });
  const require = Object.assign(
    (id: number) => (id === 64533 ? { O0: Slice } : {}),
    { m: { 64533: {} } },
  );
  const window: any = {
    webpackChunkvideoup: [],
    _profile: { upload: "ugcfx/bup" },
  };
  window.webpackChunkvideoup.push = (chunk: any) => chunk[2](require);
  const ready = runInNewContext(
    client ? BILIBILI_VIDEO_RUNTIME : BILIBILI_VIDEO_UPLOAD_RUNTIME,
    {
      window,
      crypto: webcrypto,
      location: { hostname: "member.bilibili.com" },
      document: { querySelector: () => ({ __vue__: { $api: client } }) },
      Promise,
    },
    { contextName: "bilibili-video-runtime" },
  );
  return { window, events, Slice, startUpload, ready };
}

it("video requests use native client and never repeat an ambiguous submission", async () => {
  const submitArchive = vi
    .fn()
    .mockResolvedValueOnce({ aid: "1", bvid: "BV1234567890" })
    .mockRejectedValueOnce(new Error("connection lost"));
  const pre = vi.fn().mockResolvedValue({ isLogin: true });
  const { window, ready } = fixture({
    pre,
    uploadImage: vi.fn(),
    submitArchive,
  });
  expect(ready).toBe(true);
  expect(
    await window.__pugyingArticleApi.request("/x/vupre/web/archive/pre"),
  ).toMatchObject({ code: 0, data: { isLogin: true } });
  const data = { title: "test" };
  expect(
    await window.__pugyingArticleApi.request("/x/vu/web/add/v3", data),
  ).toEqual({ code: 0, data: { aid: "1", bvid: "BV1234567890" } });
  await expect(
    window.__pugyingArticleApi.request("/x/vu/web/add/v3", data),
  ).rejects.toMatchObject({ code: "PUBLISH_RESULT_UNKNOWN" });
  expect(submitArchive).toHaveBeenCalledTimes(2);
  await expect(
    window.__pugyingArticleApi.request("/unexpected", data),
  ).rejects.toMatchObject({ code: "invalid_payload" });
  expect(submitArchive).toHaveBeenCalledTimes(2);
});

it("native client rejection preserves its business code", async () => {
  const submitArchive = vi.fn().mockRejectedValue({ code: -101 });
  const { window } = fixture({
    pre: vi.fn(),
    uploadImage: vi.fn(),
    submitArchive,
  });
  expect(
    await window.__pugyingArticleApi.request("/x/vu/web/add/v3", {}),
  ).toEqual({ code: -101 });
  expect(submitArchive).toHaveBeenCalledOnce();
});

it("uses official stdSlice once and returns upload identity, without claiming publication", async () => {
  const { window, events, Slice, startUpload, ready } = fixture();
  expect(ready).toBe(true);
  const file = { name: "test.mp4", size: 100 };
  const upload = window.__pugyingBilibiliVideoUpload(file);
  expect(startUpload).toHaveBeenCalledOnce();
  expect(Slice.mock.calls[0][0]).toBe(file);
  expect(Slice.mock.calls[0][1]).toMatchObject({
    primaryUploaderType: "stdSlice",
    fallbackTarget: null,
    sliceProfile: "ugcfx/bup",
  });
  const instance = Slice.mock.results[0].value;
  instance.cid = "9007199254740993";
  instance.filename = "uploaded-file";
  events.progress({ progress: 0.42 });
  expect(window.__pugyingVideoProgress).toBe(42);
  events.uploadComplete({
    cid: instance.cid,
    filename: instance.filename,
  });
  expect(await upload).toEqual({
    cid: "9007199254740993",
    filename: "uploaded-file",
  });
});

it("rejects completion with an unsafe numeric identity", async () => {
  const { window, events, Slice } = fixture();
  const upload = window.__pugyingBilibiliVideoUpload({
    name: "test.mp4",
    size: 100,
  });
  Slice.mock.results[0].value.cid = 9007199254740992;
  Slice.mock.results[0].value.filename = "uploaded-file";
  events.uploadComplete({});
  await expect(upload).rejects.toMatchObject({ code: "ARTICLE_API_CHANGED" });
});

it("upload failure does not restart or let a later event change the result", async () => {
  const { window, events, startUpload } = fixture();
  const upload = window.__pugyingBilibiliVideoUpload({
    name: "test.mp4",
    size: 100,
  });
  events.error({ type: "http", msg: "InvalidArgument" });
  events.uploadComplete({ cid: 1, filename: "uploaded-file" });
  await expect(upload).rejects.toMatchObject({
    code: "VIDEO_UPLOAD_FAILED",
    receipt: { stage: "stdslice_error", type: "http" },
  });
  expect(startUpload).toHaveBeenCalledOnce();
});
