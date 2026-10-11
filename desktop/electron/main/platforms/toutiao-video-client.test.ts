import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToutiaoVideoClient } from "./toutiao-video-client";

it("uploadVideo runs getAuthKey → GetVideoUploadParams → TOS → UpdateVideoUploadInfos", async () => {
  const videoPath = join(tmpdir(), `pugying-tt-video-${Date.now()}.mp4`);
  writeFileSync(videoPath, Buffer.from("ftypmp42-unit-test-bytes"));
  const requests: string[] = [];
  const transport = {
    request: vi.fn(async (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: Uint8Array;
      timeoutMs: number;
    }) => {
      requests.push(`${options.method} ${options.url}`);
      if (options.url.includes("GetPublishAuth")) {
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ status: 0, data: {} }), "utf8"),
          headers: {},
          setCookie: ["xigua_csrf_token=csrf-token"],
        };
      }
      if (options.url.includes("getAuthKey")) {
        expect(options.headers["x-csrf-token"]).toBe("csrf-token");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              status: 0,
              data: {
                accessKey: "ak-test",
                uploadToken: "HMAC-SHA1:1.0:1:ak-test:sig",
              },
            }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      if (options.url.includes("GetVideoUploadParams")) {
        expect(options.headers["X-TT-Access"]).toBe("ak-test");
        expect(options.headers.Authorization).toContain("HMAC-SHA1");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              code: 2000,
              data: {
                vid: "v-test",
                oid: "tos-cn-v/oid-1",
                tos_host: "tos.example.com",
                tos_sign: "SpaceKey/sign",
                token: "params-token",
                extra_param: "host=tos.example.com",
              },
            }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      if (options.url.includes("/upload/v1/")) {
        expect(options.headers.Authorization).toBe("SpaceKey/sign");
        expect(options.headers["Content-CRC32"]).toMatch(/^[0-9a-f]{8}$/);
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ code: 2000, message: "Success" }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      if (options.url.includes("UpdateVideoUploadInfos")) {
        const body = Buffer.from(options.body!).toString("utf8");
        expect(body).toContain("params-token");
        expect(body).toContain("v-test");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              code: 2000,
              data: {
                vid: "v-test",
                video: {
                  oid: "tos-cn-v/oid-1",
                  width: 640,
                  height: 360,
                  duration: 2,
                },
                poster: { oid: "tos-cn-p/poster-1" },
              },
            }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      return {
        status: 200,
        body: Buffer.from("{}", "utf8"),
        headers: {},
        setCookie: [],
      };
    }),
  };
  const client = new ToutiaoVideoClient(
    [{ name: "sessionid", value: "abc", domain: ".toutiao.com" }],
    transport,
    5000,
  );
  await expect(client.uploadVideo(videoPath)).resolves.toEqual({
    vid: "v-test",
    duration: 2,
    width: 640,
    height: 360,
    coverUri: "tos-cn-p/poster-1",
    uploadResult: { Uri: "tos-cn-v/oid-1", Vid: "v-test" },
  });
  expect(requests.some((item) => item.includes("GetVideoUploadParams"))).toBe(
    true,
  );
  expect(requests.some((item) => item.includes("UpdateVideoUploadInfos"))).toBe(
    true,
  );
  // 小文件走 serial 整文件，不应发起 part init
  expect(requests.some((item) => item.includes("phase=init"))).toBe(false);
  await client.dispose();
});

it("uploadVideo uses TOS multipart above part-size threshold and reports progress", async () => {
  const videoPath = join(tmpdir(), `pugying-tt-video-mp-${Date.now()}.mp4`);
  // 20 字节、分片 8 → 3 片
  writeFileSync(videoPath, Buffer.from("ftypmp42-unit-test!!"));
  const requests: string[] = [];
  const progresses: number[] = [];
  const transport = {
    request: vi.fn(async (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: Uint8Array;
    }) => {
      requests.push(`${options.method} ${options.url}`);
      if (options.url.includes("GetPublishAuth")) {
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ status: 0, data: {} }), "utf8"),
          headers: {},
          setCookie: ["xigua_csrf_token=csrf-token"],
        };
      }
      if (options.url.includes("getAuthKey")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              status: 0,
              data: {
                accessKey: "ak-test",
                uploadToken: "HMAC-SHA1:1.0:1:ak-test:sig",
              },
            }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      if (options.url.includes("GetVideoUploadParams")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              code: 2000,
              data: {
                vid: "v-mp",
                oid: "tos-cn-v/oid-mp",
                tos_host: "tos.example.com",
                tos_sign: "SpaceKey/sign",
                token: "params-token",
                extra_param: "host=tos.example.com",
              },
            }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      if (options.url.includes("phase=init")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              code: 2000,
              data: { uploadid: "up-mp-1" },
            }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      if (options.url.includes("phase=transfer")) {
        expect(options.headers["Content-CRC32"]).toMatch(/^[0-9a-f]{8}$/);
        expect(options.url).toContain("uploadid=up-mp-1");
        expect(options.url).toContain("part_number=");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              code: 2000,
              data: { crc32: options.headers["Content-CRC32"] },
            }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      if (options.url.includes("phase=finish")) {
        const body = Buffer.from(options.body!).toString("utf8");
        expect(body).toMatch(/^1:[0-9a-f]{8}/);
        expect(options.url).toContain("uploadmode=part");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ code: 2000, message: "Success" }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      if (options.url.includes("UpdateVideoUploadInfos")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              code: 2000,
              data: {
                vid: "v-mp",
                video: {
                  oid: "tos-cn-v/oid-mp",
                  width: 640,
                  height: 360,
                  duration: 2,
                },
                poster: { oid: "tos-cn-p/poster-mp" },
              },
            }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      return {
        status: 200,
        body: Buffer.from("{}", "utf8"),
        headers: {},
        setCookie: [],
      };
    }),
  };
  const client = new ToutiaoVideoClient(
    [{ name: "sessionid", value: "abc", domain: ".toutiao.com" }],
    transport,
    5000,
    8,
  );
  await expect(
    client.uploadVideo(videoPath, {
      onProgress: (p) => {
        progresses.push(p.percent);
      },
    }),
  ).resolves.toMatchObject({ vid: "v-mp", coverUri: "tos-cn-p/poster-mp" });
  expect(requests.some((item) => item.includes("phase=init"))).toBe(true);
  expect(
    requests.filter((item) => item.includes("phase=transfer")).length,
  ).toBeGreaterThanOrEqual(2);
  expect(requests.some((item) => item.includes("phase=finish"))).toBe(true);
  expect(progresses.at(-1)).toBe(100);
  expect(progresses[0]).toBe(0);
  await client.dispose();
});

it("maps getAuthKey status -12 to AUTH_EXPIRED", async () => {
  const videoPath = join(tmpdir(), `pugying-tt-video-auth-${Date.now()}.mp4`);
  writeFileSync(videoPath, Buffer.from("ftypmp42-unit-test-bytes"));
  const transport = {
    request: vi.fn(async (options: { url: string }) => {
      if (options.url.includes("GetPublishAuth")) {
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ status: 0, data: {} }), "utf8"),
          headers: {},
          setCookie: ["xigua_csrf_token=csrf-token"],
        };
      }
      if (options.url.includes("getAuthKey")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ status: -12, message: "no login" }),
            "utf8",
          ),
          headers: {},
          setCookie: [],
        };
      }
      return {
        status: 200,
        body: Buffer.from("{}", "utf8"),
        headers: {},
        setCookie: [],
      };
    }),
  };
  const client = new ToutiaoVideoClient(
    [
      { name: "sessionid", value: "sess", domain: ".toutiao.com" },
      { name: "uid_tt", value: "u1", domain: ".toutiao.com" },
    ],
    transport,
    5000,
  );
  await expect(client.uploadVideo(videoPath)).rejects.toMatchObject({
    code: "AUTH_EXPIRED",
  });
  // 失败发生在读大文件之前：除 GetPublishAuth/getAuthKey 外不应再打 VAS
  expect(
    transport.request.mock.calls.some((call) =>
      String(call[0]?.url ?? "").includes("GetVideoUploadParams"),
    ),
  ).toBe(false);
  await client.dispose();
});

it("keeps login cookies after GetPublishAuth Set-Cookie absorb", async () => {
  const transport = {
    request: vi.fn(async () => ({
      status: 200,
      body: Buffer.from(JSON.stringify({ status: 0, data: {} }), "utf8"),
      headers: {},
      setCookie: [
        "xigua_csrf_token=csrf-from-auth",
        "xg_p_tos_token=tos-token",
      ],
    })),
  };
  const client = new ToutiaoVideoClient(
    [
      { name: "sessionid", value: "sess-keep", domain: ".toutiao.com" },
      { name: "uid_tt", value: "uid-keep", domain: ".toutiao.com" },
    ],
    transport,
    5000,
  );
  await client.request("/xigua/api/upload/GetPublishAuth");
  const cookie = String(
    transport.request.mock.calls.at(-1)?.[0]?.headers?.Cookie ?? "",
  );
  // 第二次请求（若再调）应仍带登录态；此处直接读内部头：再发一次
  transport.request.mockClear();
  transport.request.mockResolvedValue({
    status: 200,
    body: Buffer.from(JSON.stringify({ status: 0, data: {} }), "utf8"),
    headers: {},
    setCookie: [],
  });
  await client.request("/xigua/api/upload/GetPublishAuth");
  const nextCookie = String(
    transport.request.mock.calls[0]?.[0]?.headers?.Cookie ?? "",
  );
  expect(nextCookie).toContain("sessionid=sess-keep");
  expect(nextCookie).toContain("uid_tt=uid-keep");
  expect(nextCookie).toContain("xigua_csrf_token=csrf-from-auth");
  expect(cookie).toContain("sessionid=sess-keep");
  await client.dispose();
});
