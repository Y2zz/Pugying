import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ArticleApiError } from "./article-api";
import { DouyinGraphicClient } from "./douyin-graphic-client";

it("prepare reads STS from auth/v5 and createAweme posts signed create_v2", async () => {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const transport = {
    request: vi.fn(async (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: Uint8Array;
      timeoutMs: number;
    }) => {
      requests.push({
        url: options.url,
        method: options.method,
        body: options.body
          ? Buffer.from(options.body).toString("utf8")
          : undefined,
      });
      if (options.url.includes("upload/auth/v5")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              status_code: 0,
              auth: JSON.stringify({
                AccessKeyID: "AKTP1",
                SecretAccessKey: "secret1",
                SessionToken: "STS2token",
              }),
            }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("create_v2")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ status_code: 0, item_id: "1234567890123456789" }),
            "utf8",
          ),
        };
      }
      return { status: 200, body: Buffer.from("{}", "utf8") };
    }),
  };
  const client = new DouyinGraphicClient(
    [{ name: "sessionid", value: "abc", domain: ".douyin.com" }],
    transport,
    5000,
    async (path) =>
      `https://creator.douyin.com${path}${path.includes("?") ? "&" : "?"}a_bogus=x`,
  );
  await client.prepare();
  expect(requests[0]?.url).toContain("upload/auth/v5");
  expect(requests[0]?.url).toContain("a_bogus=x");

  const response = await client.createAweme({
    common: { media_type: 2 },
  });
  expect(response).toMatchObject({
    status_code: 0,
    item_id: "1234567890123456789",
  });
  const create = requests.find((item) => item.url.includes("create_v2"));
  expect(create?.method).toBe("POST");
  expect(create?.body).toContain('"media_type":2');
  await client.dispose();
});

it("searchTopics parses challengesug suggestions", async () => {
  const transport = {
    request: vi.fn(async () => ({
      status: 200,
      body: Buffer.from(
        JSON.stringify({
          status_code: 0,
          sug_list: [{ cha_name: "日常", cid: "111" }],
        }),
        "utf8",
      ),
    })),
  };
  const client = new DouyinGraphicClient(
    [{ name: "sessionid", value: "abc", domain: ".douyin.com" }],
    transport,
    5000,
    async (path) => `https://creator.douyin.com${path}&a_bogus=x`,
  );
  await expect(client.searchTopics("日常")).resolves.toEqual([
    { id: "111", name: "日常" },
  ]);
});

it("uploadVideo runs Apply → PUT → Commit → enable/transend", async () => {
  const videoPath = join(tmpdir(), `pugying-douyin-video-${Date.now()}.mp4`);
  writeFileSync(videoPath, Buffer.from("ftypmp42-unit-test-bytes"));
  const requests: string[] = [];
  let transendCalls = 0;
  const transport = {
    request: vi.fn(async (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: Uint8Array;
      timeoutMs: number;
    }) => {
      requests.push(`${options.method} ${options.url}`);
      if (options.url.includes("upload/auth/v5")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              status_code: 0,
              auth: JSON.stringify({
                AccessKeyID: "AKTP1",
                SecretAccessKey: "secret1",
                SessionToken: "STS2token",
              }),
            }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("Action=ApplyUploadInner")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              Result: {
                InnerUploadAddress: {
                  UploadNodes: [
                    {
                      Vid: "v-apply",
                      SessionKey: "session-key",
                      UploadHost: "tos-d-ct-lq.bytedancevod.com",
                      StoreInfos: [
                        {
                          StoreUri: "tos-cn-v-0015/object",
                          Auth: "SpaceKey/aweme/auth",
                        },
                      ],
                    },
                  ],
                },
              },
            }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("/upload/v1/")) {
        expect(options.headers.Authorization).toBe("SpaceKey/aweme/auth");
        expect(options.headers["Content-CRC32"]).toMatch(/^[0-9a-f]{8}$/);
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ code: 2000, message: "Success" }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("Action=CommitUploadInner")) {
        expect(Buffer.from(options.body!).toString("utf8")).toContain(
          "session-key",
        );
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              Result: { Results: [{ Vid: "v-commit" }] },
            }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("/web/api/media/video/enable/")) {
        expect(options.url).toContain("video_id=v-commit");
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ status_code: 0 }), "utf8"),
        };
      }
      if (options.url.includes("/web/api/media/video/transend/")) {
        transendCalls += 1;
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify(
              transendCalls === 1
                ? { status_code: 0, encode: 0 }
                : {
                    status_code: 0,
                    encode: 1,
                    duration: 2,
                    width: "640",
                    height: "360",
                    poster_uri: "tos-cn-p/poster",
                  },
            ),
            "utf8",
          ),
        };
      }
      return { status: 200, body: Buffer.from("{}", "utf8") };
    }),
  };
  const client = new DouyinGraphicClient(
    [{ name: "sessionid", value: "abc", domain: ".douyin.com" }],
    transport,
    5000,
    async (path) =>
      `https://creator.douyin.com${path}${path.includes("?") ? "&" : "?"}a_bogus=x`,
  );
  await expect(client.uploadVideo(videoPath)).resolves.toEqual({
    vid: "v-commit",
    duration: 2,
    width: 640,
    height: 360,
    coverUri: "tos-cn-p/poster",
  });
  expect(requests.some((item) => item.includes("ApplyUploadInner"))).toBe(
    true,
  );
  expect(requests.some((item) => item.includes("CommitUploadInner"))).toBe(
    true,
  );
  expect(transendCalls).toBe(2);
  expect(requests.some((item) => item.includes("phase=init"))).toBe(false);
  await client.dispose();
});

it("uploadVideo above the part threshold uses init, transfer and finish", async () => {
  const videoPath = join(tmpdir(), `pugying-douyin-video-part-${Date.now()}.mp4`);
  writeFileSync(videoPath, Buffer.alloc(20, 7));
  const requests: string[] = [];
  const progresses: number[] = [];
  const sessionToken = `STS2${Buffer.from(
    JSON.stringify({
      PolicyString: JSON.stringify({
        Statement: [{ Condition: JSON.stringify({ UserId: "77964521232" }) }],
      }),
    }),
    "utf8",
  ).toString("base64")}`;
  const transport = {
    request: vi.fn(async (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: Uint8Array;
    }) => {
      requests.push(`${options.method} ${options.url}`);
      if (options.url.includes("upload/auth/v5")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              status_code: 0,
              auth: JSON.stringify({
                AccessKeyID: "AKTP1",
                SecretAccessKey: "secret1",
                SessionToken: sessionToken,
              }),
            }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("Action=ApplyUploadInner")) {
        expect(options.url).toContain("FileSize=20");
        expect(options.url).toContain("user_id=77964521232");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              Result: {
                InnerUploadAddress: {
                  UploadNodes: [
                    {
                      Vid: "v-apply",
                      SessionKey: "session-key",
                      UploadHost: "tos-d-x-lf.snssdk.com",
                      StoreInfos: [
                        {
                          StoreUri: "tos-cn-v-0015/object",
                          Auth: "SpaceKey/aweme/auth",
                          StorageHeader: { USER_ID: "77964521232" },
                        },
                      ],
                    },
                  ],
                },
              },
            }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("phase=init")) {
        expect(options.headers.Authorization).toBe("SpaceKey/aweme/auth");
        expect(options.headers["X-Storage-Mode"]).toBe("gateway");
        expect(options.headers["X-Storage-U"]).toBe("77964521232");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ code: 2000, data: { uploadid: "up-dy-1" } }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("phase=transfer")) {
        expect(options.headers["Content-CRC32"]).toMatch(/^[0-9a-f]{8}$/);
        expect(options.url).toContain("uploadid=up-dy-1");
        expect(options.url).toContain("part_offset=");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              code: 2000,
              data: { crc32: options.headers["Content-CRC32"] },
            }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("phase=finish")) {
        expect(Buffer.from(options.body!).toString("utf8")).toMatch(
          /^1:[0-9a-f]{8}/,
        );
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ code: 2000 }), "utf8"),
        };
      }
      if (options.url.includes("Action=CommitUploadInner")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ Result: { Results: [{ Vid: "v-commit" }] } }),
            "utf8",
          ),
        };
      }
      if (options.url.includes("/web/api/media/video/enable/")) {
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ status_code: 0 }), "utf8"),
        };
      }
      if (options.url.includes("/web/api/media/video/transend/")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              status_code: 0,
              encode: 1,
              duration: 2,
              width: 640,
              height: 360,
              poster_uri: "tos-cn-p/poster",
            }),
            "utf8",
          ),
        };
      }
      return { status: 200, body: Buffer.from("{}", "utf8") };
    }),
  };
  const client = new DouyinGraphicClient(
    [{ name: "sessionid", value: "abc", domain: ".douyin.com" }],
    transport,
    5000,
    async (path) => `https://creator.douyin.com${path}?a_bogus=x`,
    8,
  );
  await expect(
    client.uploadVideo(videoPath, {
      onProgress: (progress) => {
        progresses.push(progress.percent);
      },
    }),
  ).resolves.toMatchObject({ vid: "v-commit" });
  expect(requests.some((item) => item.includes("phase=init"))).toBe(true);
  const transfers = requests.filter((item) => item.includes("phase=transfer"));
  expect(transfers).toHaveLength(2);
  expect(transfers.some((item) => item.includes("part_offset=0"))).toBe(true);
  expect(transfers.some((item) => item.includes("part_offset=8"))).toBe(true);
  expect(transfers.some((item) => item.includes("part_number=3"))).toBe(false);
  expect(requests.some((item) => item.includes("phase=finish"))).toBe(true);
  expect(progresses[0]).toBe(0);
  expect(progresses.at(-1)).toBe(100);
  await client.dispose();
});

it("does not treat create_v2 403 as expired login", async () => {
  const client = new DouyinGraphicClient(
    [{ name: "sessionid", value: "abc", domain: ".douyin.com" }],
    {
      request: vi.fn(async () => ({
        status: 403,
        body: new Uint8Array(),
      })),
    },
    5000,
    async (path) => `https://creator.douyin.com${path}?a_bogus=x`,
  );
  await expect(
    client.createAweme({ common: { media_type: 4 } }),
  ).rejects.toMatchObject<ArticleApiError>({
    code: "PUBLISH_FAILED",
    message: "发布未成功，请稍后重试",
  });
  await client.dispose();
});

it("still maps creator 401 to AUTH_EXPIRED", async () => {
  const client = new DouyinGraphicClient(
    [{ name: "sessionid", value: "abc", domain: ".douyin.com" }],
    {
      request: vi.fn(async () => ({
        status: 401,
        body: new Uint8Array(),
      })),
    },
    5000,
    async (path) => `https://creator.douyin.com${path}?a_bogus=x`,
  );
  await expect(
    client.createAweme({ common: { media_type: 4 } }),
  ).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  await client.dispose();
});
