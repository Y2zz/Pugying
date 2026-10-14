import { ArticleApiError } from "./article-api";
import { runXiaohongshuGraphicPublish } from "./publish-xiaohongshu-graphic";
import type { XiaohongshuGraphicPublishOptions } from "./publish-xiaohongshu-graphic";

function fixture() {
  const uploadImage = vi.fn(async (path: string) => ({
    uri: `spectrum/${path.split("/").pop()}`,
    url: "https://preview.example/pic.png",
    width: 1086,
    height: 1448,
    size: 10,
  }));
  const createNote = vi.fn(async () => ({
    id: "68e102001234567890abcdef",
    raw: { success: true, data: { id: "68e102001234567890abcdef" } },
  }));
  const dispose = vi.fn(async () => {});
  const client = { uploadImage, createNote, dispose };
  const options: XiaohongshuGraphicPublishOptions = {
    payload: {
      requestId: "job",
      targetId: "target",
      platform: "xiaohongshu",
      accountId: "account",
      contentType: "graphic",
      title: "桌上留一点绿",
      body: "给桌面留一点空。",
      mediaPaths: ["/tmp/two.png", "/tmp/one.png"],
      coverPath: "",
      cookies: [],
      authorDeclaration: "ai_generated",
      visibility: "private",
    },
    signal: { cancelled: false },
    onProgress: vi.fn(),
    createClient: vi.fn(async () => client as never),
  };
  return { options, client, createNote, uploadImage, dispose };
}

it("submits a private image note in slot order with an AI declaration", async () => {
  const { options, createNote, uploadImage, dispose } = fixture();
  expect(await runXiaohongshuGraphicPublish(options)).toMatchObject({
    ok: true,
    platformPostId: "68e102001234567890abcdef",
  });
  expect(uploadImage.mock.calls.map(([path]) => path)).toEqual(
    options.payload.mediaPaths,
  );
  const data = createNote.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(data.common).toMatchObject({
    type: "normal",
    title: "桌上留一点绿",
    desc: "给桌面留一点空。",
    privacy_info: { op_type: 1, type: 1, user_ids: [] },
  });
  expect(
    JSON.parse((data.common as { business_binds: string }).business_binds),
  ).toMatchObject({
    userDeclarationBind: { origin: 2 },
  });
  expect(
    (data.image_info as { images: Array<{ file_id: string }> }).images.map(
      (image) => image.file_id,
    ),
  ).toEqual(["spectrum/two.png", "spectrum/one.png"]);
  expect(JSON.stringify(data)).not.toMatch(/\/tmp\/|cookies/);
  expect(dispose).toHaveBeenCalledOnce();
});

it("uses milliseconds in the schedule business binding", async () => {
  const { options, createNote } = fixture();
  const time = Math.ceil((Date.now() + 7200000) / 60000) * 60000;
  options.payload.scheduledAt = new Date(time).toISOString();
  await runXiaohongshuGraphicPublish(options);
  expect(
    JSON.parse(
      (createNote.mock.calls[0]?.[0] as { common: { business_binds: string } })
        .common.business_binds,
    ),
  ).toMatchObject({ bizType: 13, notePostTiming: { postTime: time } });
});

it("stops after an image upload fails and disposes the client", async () => {
  const { options, createNote, uploadImage, dispose } = fixture();
  uploadImage.mockRejectedValueOnce(
    new ArticleApiError("MEDIA_MISSING", "找不到图片，请重新选择"),
  );
  expect(await runXiaohongshuGraphicPublish(options)).toMatchObject({
    ok: false,
    errorCode: "MEDIA_MISSING",
  });
  expect(createNote).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});
