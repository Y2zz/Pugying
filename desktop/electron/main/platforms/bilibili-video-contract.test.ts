import {
  buildBilibiliVideoSubmission,
  parseBilibiliVideoReceipt,
} from "./bilibili-video-contract";
import type { BilibiliVideoSubmission } from "./bilibili-video-contract";

const input: BilibiliVideoSubmission = {
  title: "视频接口测试",
  description: "检查上传与发布结果。",
  partitionId: 21,
  tags: ["测试"],
  coverUrl: "https://i0.hdslb.com/test.jpg",
  filename: "uploaded-video",
  cid: "9007199254740993",
  visibility: "private",
  copyright: 1,
};

it("单视频使用上传标识并保留大整数 cid，私密发布采用官方字段", () => {
  const body = buildBilibiliVideoSubmission(input);
  expect(body.videos[0]).toEqual({
    filename: input.filename,
    title: input.title,
    desc: "",
    cid: input.cid,
  });
  expect(body.is_only_self).toBe(1);
  expect(body.no_reprint).toBe(1);
  expect(body.web_os).toBe(
    process.platform === "win32" ? 1 : process.platform === "darwin" ? 2 : 3,
  );
  expect(body).not.toHaveProperty("source");
  // 安全整数 cid 可转成数字以贴合官方 JSON。
  expect(
    buildBilibiliVideoSubmission({ ...input, cid: "42541714583" }).videos[0]
      .cid,
  ).toBe(42541714583);
});

it("转载必须填写来源，分区与标签不能为空", () => {
  expect(() =>
    buildBilibiliVideoSubmission({ ...input, copyright: 2 }),
  ).toThrow();
  expect(() =>
    buildBilibiliVideoSubmission({ ...input, partitionId: 0 }),
  ).toThrow();
  expect(() => buildBilibiliVideoSubmission({ ...input, tags: [] })).toThrow();
  const body = buildBilibiliVideoSubmission({
    ...input,
    copyright: 2,
    source: "原视频来源",
    visibility: "public",
  });
  expect(body.source).toBe("原视频来源");
  expect(body.no_reprint).toBe(0);
  expect(body.is_only_self).toBe(0);
});

it("定时使用秒级时间，声明使用官方配置返回的 ID", () => {
  const time = Date.now() + 86400000;
  const body = buildBilibiliVideoSubmission({
    ...input,
    scheduledAt: new Date(time).toISOString(),
    creationStatementId: 123,
  });
  expect(body.dtime).toBe(Math.floor(time / 1000));
  expect(body.creation_statement).toEqual({ id: 123 });
  expect(() =>
    buildBilibiliVideoSubmission({ ...input, scheduledAt: "invalid" }),
  ).toThrow();
});

it("仅完整投稿回执算成功，上传 cid 和精度丢失的 aid 不算成功", () => {
  expect(
    parseBilibiliVideoReceipt({
      code: 0,
      data: { aid: "9007199254740993", bvid: "BV1234567890" },
    }).aid,
  ).toBe("9007199254740993");
  expect(() =>
    parseBilibiliVideoReceipt({ code: 0, data: { cid: "1" } }),
  ).toThrow("尚未确认发布结果");
  expect(() =>
    parseBilibiliVideoReceipt({
      code: 0,
      data: { aid: 9007199254740992, bvid: "BV1234567890" },
    }),
  ).toThrow("尚未确认发布结果");
  expect(() => parseBilibiliVideoReceipt({ code: -101 })).toThrow(
    "账号登录已失效",
  );
  expect(() => parseBilibiliVideoReceipt({ code: 1001 })).toThrow(
    "平台未接受发布",
  );
});
