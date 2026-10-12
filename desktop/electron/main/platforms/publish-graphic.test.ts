import { runPlatformGraphicPublish } from "./publish-graphic";

it("routes xiaohongshu graphic to the Cookie publish path", async () => {
  const result = await runPlatformGraphicPublish({
    payload: {
      requestId: "job",
      targetId: "target",
      platform: "xiaohongshu",
      accountId: "account",
      contentType: "graphic",
      title: "",
      body: "",
      mediaPaths: [],
      coverPath: "",
      cookies: [],
    },
    signal: { cancelled: false },
    onProgress: vi.fn(),
  });
  expect(result).toMatchObject({
    ok: false,
    errorCode: "invalid_payload",
    platform: "xiaohongshu",
  });
});

it("rejects unsupported platforms", async () => {
  expect(
    await runPlatformGraphicPublish({
      payload: {
        requestId: "job",
        targetId: "target",
        platform: "bilibili" as never,
        accountId: "account",
        contentType: "graphic",
        title: "t",
        body: "b",
        mediaPaths: ["/tmp/a.png"],
        coverPath: "",
        cookies: [],
      },
      signal: { cancelled: false },
      onProgress: vi.fn(),
    }),
  ).toMatchObject({
    ok: false,
    errorCode: "unsupported_platform",
  });
});
