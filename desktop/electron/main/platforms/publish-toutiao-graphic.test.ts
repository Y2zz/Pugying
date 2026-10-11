import { ArticleApiError } from "./article-api";
import type { ToutiaoGraphicClient } from "./toutiao-graphic-client";
import {
  runToutiaoGraphicPublish,
  toutiaoGraphicText,
  type ToutiaoGraphicPublishOptions,
} from "./publish-toutiao-graphic";

const ID = "7693773543242304768";

function fixture() {
  const createWtt = vi.fn(
    async (_data: Record<string, unknown>): Promise<Record<string, unknown>> => ({
      code: 0,
      data: { threadId: ID },
    }),
  );
  const uploadImage = vi.fn(async (path: string) => ({
    uri: `remote/${path.split("/").pop()}`,
    url: "https://images.example/pic.png",
    width: 1086,
    height: 1448,
    size: 10,
  }));
  const dispose = vi.fn(async () => {});
  const client = {
    uploadImage,
    createWtt,
    dispose,
  } as unknown as ToutiaoGraphicClient;
  const options: ToutiaoGraphicPublishOptions = {
    payload: {
      requestId: "job",
      targetId: "target",
      platform: "toutiao",
      accountId: "account",
      contentType: "graphic",
      title: "桌上留一点绿",
      body: "给桌面留一点空。",
      mediaPaths: ["/tmp/two.png", "/tmp/one.png"],
      coverPath: "",
      cookies: [],
      authorDeclaration: "ai_generated",
      visibility: "public",
    },
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createClient: vi.fn(async () => client),
  };
  return { options, client, createWtt, uploadImage, dispose };
}

it("joins title as the first paragraph and submits ordered image uris", async () => {
  const { options, createWtt, uploadImage, dispose } = fixture();
  expect(await runToutiaoGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: ID,
    platformUrl: `https://www.toutiao.com/w/${ID}/`,
  });
  expect(uploadImage.mock.calls.map(([path]) => path)).toEqual(
    options.payload.mediaPaths,
  );
  expect(createWtt).toHaveBeenCalledWith({
    content: "桌上留一点绿\n\n给桌面留一点空。",
    image_list: ["remote/two.png", "remote/one.png"],
    pre_upload: 1,
    entrance: "main",
    extra: JSON.stringify({
      info_source: JSON.stringify({
        source_type: 3,
        source_author_uid: "",
      }),
    }),
  });
  expect(dispose).toHaveBeenCalledOnce();
});

it("stops after upload failure without submitting", async () => {
  const { options, createWtt, uploadImage, dispose } = fixture();
  uploadImage.mockRejectedValueOnce(
    new ArticleApiError("MEDIA_MISSING", "找不到图片，请重新选择"),
  );
  expect(await runToutiaoGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: "MEDIA_MISSING",
  });
  expect(createWtt).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});

it("does not retry after losing the submission response", async () => {
  const { options, createWtt } = fixture();
  createWtt.mockRejectedValueOnce(new Error("token=secret"));
  const result = await runToutiaoGraphicPublish(options);
  expect(result).toMatchObject({
    ok: false,
    errorCode: "PUBLISH_RESULT_UNKNOWN",
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(createWtt).toHaveBeenCalledOnce();
});

it("retains a confirmed receipt when cancellation arrives during submission", async () => {
  const { options, createWtt } = fixture();
  createWtt.mockImplementationOnce(async () => {
    options.signal.cancelled = true;
    return { code: 0, data: { threadId: ID } };
  });
  expect(await runToutiaoGraphicPublish(options)).toMatchObject({ ok: true });
});

it.each([
  { visibility: "private" as const },
  { scheduledAt: new Date(Date.now() + 7200000).toISOString() },
  { title: "字".repeat(100), body: "字".repeat(1950) },
  { tags: ["日常"] },
])("rejects unavailable settings before opening a client: %j", async (fields) => {
  const { options } = fixture();
  Object.assign(options.payload, fields);
  expect(await runToutiaoGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: "invalid_payload",
  });
  expect(options.createClient).not.toHaveBeenCalled();
});

it("toutiaoGraphicText joins title and body with a blank line", () => {
  expect(toutiaoGraphicText("标题", "正文")).toBe("标题\n\n正文");
  expect(toutiaoGraphicText("  ", "正文")).toBe("正文");
});
