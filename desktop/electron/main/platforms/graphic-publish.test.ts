import { ArticleApiError } from "./article-api";
import type { DouyinGraphicClient } from "./douyin-graphic-client";
import {
  douyinGraphicCaption,
  runDouyinGraphicPublish,
  type GraphicPublishOptions,
} from "./publish-douyin-graphic";

const ID = "7561234567890123456";

function fixture() {
  const createAweme = vi.fn(
    async (_item: Record<string, unknown>): Promise<Record<string, unknown>> => ({
      status_code: 0,
      item_id: ID,
    }),
  );
  const uploadImage = vi.fn(async (path: string) => ({
    uri: `uri-${path.split("/").pop()}`,
    url: "https://images.example/picture.png",
    width: 900,
    height: 1200,
    size: 10,
  }));
  const searchTopics = vi.fn(async (keyword: string) => {
    const map: Record<string, { id: string; name: string }> = {
      日常: { id: "111", name: "日常" },
      绿植: { id: "222", name: "绿植" },
    };
    return map[keyword] ? [map[keyword]] : [];
  });
  const prepare = vi.fn(async () => {});
  const dispose = vi.fn(async () => {});
  const client = {
    prepare,
    uploadImage,
    createAweme,
    searchTopics,
    dispose,
  } as unknown as DouyinGraphicClient;
  const options: GraphicPublishOptions = {
    payload: {
      requestId: "job",
      targetId: "target",
      platform: "douyin",
      accountId: "account",
      contentType: "graphic",
      title: "桌上留一点绿",
      body: "给桌面留一点空。\n#日常",
      tags: ["日常", "绿植"],
      topicRefs: [
        { id: "111", name: "日常" },
        { id: "222", name: "绿植" },
      ],
      mediaPaths: ["/tmp/second.png", "/tmp/first.png"],
      coverPath: "/tmp/first.png",
      cookies: [],
    },
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createClient: vi.fn(async () => client),
  };
  return {
    options,
    client,
    createAweme,
    uploadImage,
    searchTopics,
    prepare,
    dispose,
  };
}

it("publishes ordered uploaded images with a cover, private visibility, download setting, title markers and AI declaration", async () => {
  const { options, createAweme, uploadImage, dispose } = fixture();
  Object.assign(options.payload, {
    visibility: "private",
    allowDownload: false,
    authorDeclaration: "ai_generated",
  });
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: ID,
    platformUrl: `https://www.douyin.com/note/${ID}`,
  });
  expect(uploadImage.mock.calls.map(([path]) => path)).toEqual([
    "/tmp/second.png",
    "/tmp/first.png",
  ]);
  const item = createAweme.mock.calls[0]![0] as any;
  expect(item.common).toMatchObject({
    media_type: 2,
    text: "桌上留一点绿。给桌面留一点空。\n#日常\n#绿植",
    visibility_type: 1,
    download: 0,
    timing: -1,
    images: [
      { uri: "uri-second.png", width: 900, height: 1200 },
      { uri: "uri-first.png", width: 900, height: 1200 },
    ],
  });
  expect(item.cover).toEqual({ poster: "uri-first.png" });
  expect(JSON.parse(item.declare.user_declare_info)).toEqual({
    choose_value: "aigc",
  });
  expect(JSON.stringify(item)).not.toMatch(/\/tmp\/|cookies/);
  expect(dispose).toHaveBeenCalledOnce();
});

it("uses UTF-16 offsets and does not append a second title separator", () => {
  const caption = douyinGraphicCaption("绿🌿。", "桌面 #日常", [
    { id: "88", name: "日常" },
  ]);
  expect(caption.text).toBe("绿🌿。桌面 #日常");
  expect(JSON.parse(caption.text_extra)).toEqual([
    { start: 0, end: 4, hashtag_id: 0, hashtag_name: "", type: 7 },
    { start: 7, end: 10, hashtag_id: "88", hashtag_name: "日常", type: 1 },
  ]);
});

it("uses saved topic resource ids without searching again", async () => {
  const { options, createAweme, searchTopics, dispose } = fixture();
  options.payload.topicRefs = [
    { id: "555", name: "日常" },
    { id: "666", name: "绿植" },
  ];
  expect(await runDouyinGraphicPublish(options)).toMatchObject({ ok: true });
  expect(searchTopics).not.toHaveBeenCalled();
  const item = createAweme.mock.calls[0]![0] as any;
  expect(JSON.parse(item.common.text_extra)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ hashtag_id: "555", hashtag_name: "日常" }),
      expect.objectContaining({ hashtag_id: "666", hashtag_name: "绿植" }),
    ]),
  );
  expect(dispose).toHaveBeenCalledOnce();
});

it("searches unbound tag names before submitting", async () => {
  const { options, createAweme, searchTopics } = fixture();
  options.payload.topicRefs = undefined;
  expect(await runDouyinGraphicPublish(options)).toMatchObject({ ok: true });
  expect(searchTopics).toHaveBeenCalledTimes(2);
  const item = createAweme.mock.calls[0]![0] as any;
  expect(JSON.parse(item.common.text_extra)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ hashtag_id: "111", hashtag_name: "日常" }),
      expect.objectContaining({ hashtag_id: "222", hashtag_name: "绿植" }),
    ]),
  );
});

it.each([
  { title: "文".repeat(21) },
  { body: "" },
  { body: "文".repeat(1001) },
  { mediaPaths: [] },
  { mediaPaths: Array(31).fill("/tmp/image.png") },
  { coverPath: "" },
  { visibility: "invalid" },
  { authorDeclaration: "invalid" },
  { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
  { tags: ["话题一", "话题二", "话题三", "话题四", "话题五", "话题六"] },
])("rejects invalid input before creating a client: %j", async (fields) => {
  const { options, createAweme } = fixture();
  Object.assign(options.payload, fields);
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: "invalid_payload",
  });
  expect(options.createClient).not.toHaveBeenCalled();
  expect(createAweme).not.toHaveBeenCalled();
});

it.each([
  ["personal_opinion", "personal_opinion"],
  ["reposted", "from_net_v3"],
  ["marketing", "marketing"],
  ["fictional", "only_fun_new"],
] as const)(
  "maps %s to the current declaration contract",
  async (declaration, value) => {
    const { options, createAweme } = fixture();
    options.payload.authorDeclaration = declaration;
    await runDouyinGraphicPublish(options);
    const item = createAweme.mock.calls[0]![0] as any;
    expect(JSON.parse(item.declare.user_declare_info)).toEqual({
      choose_value: value,
    });
  },
);

it("preserves scheduling and friend visibility without an unnecessary declaration", async () => {
  const { options, createAweme } = fixture();
  const time = Date.now() + 3 * 3600000;
  Object.assign(options.payload, {
    scheduledAt: new Date(time).toISOString(),
    visibility: "friends",
  });
  await runDouyinGraphicPublish(options);
  const item = createAweme.mock.calls[0]![0] as any;
  expect(item.common.timing).toBe(Math.floor(time / 1000));
  expect(item.common.visibility_type).toBe(2);
  expect(item.declare).toBeUndefined();
});

it("does not submit after an upload failure and always disposes the client", async () => {
  const { options, createAweme, uploadImage, dispose } = fixture();
  uploadImage.mockRejectedValueOnce(
    new ArticleApiError("MEDIA_MISSING", "找不到图片，请重新选择"),
  );
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: "MEDIA_MISSING",
  });
  expect(createAweme).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});

it("stops before submission if cancelled during upload", async () => {
  const { options, createAweme, uploadImage, dispose } = fixture();
  uploadImage.mockImplementationOnce(async () => {
    options.signal.cancelled = true;
    return {
      uri: "one",
      url: "https://images.example/one.png",
      width: 900,
      height: 1200,
      size: 10,
    };
  });
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: "cancelled",
  });
  expect(createAweme).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});

it("keeps a definite receipt even if cancellation arrives after submission", async () => {
  const { options, createAweme } = fixture();
  createAweme.mockImplementationOnce(async () => {
    options.signal.cancelled = true;
    return { status_code: 0, item_id: ID };
  });
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: ID,
  });
});

it.each([{ status_code: 0 }, { status_code: 0, item_id: Number(ID) }, {}])(
  "does not invent a successful receipt: %j",
  async (response) => {
    const { options, createAweme } = fixture();
    createAweme.mockResolvedValueOnce(response);
    expect(await runDouyinGraphicPublish(options)).toMatchObject({
      ok: false,
      errorCode: "PUBLISH_RESULT_UNKNOWN",
    });
    expect(createAweme).toHaveBeenCalledOnce();
  },
);

it("never retries a disconnected submit and hides raw transport details", async () => {
  const { options, createAweme, dispose } = fixture();
  createAweme.mockRejectedValueOnce(new Error("Cookie secret"));
  const result = await runDouyinGraphicPublish(options);
  expect(result).toMatchObject({
    ok: false,
    errorCode: "PUBLISH_RESULT_UNKNOWN",
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(createAweme).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it("keeps platform rejection distinct from expired login", async () => {
  const { options, createAweme } = fixture();
  createAweme.mockResolvedValueOnce({ status_code: 8 });
  expect(await runDouyinGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: "AUTH_EXPIRED",
  });
});
