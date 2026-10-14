import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BilibiliVideoClient,
  type BilibiliVideoHttpTransport,
} from "./bilibili-video-client";

const SAMPLE = join(
  process.cwd(),
  "../output/video-publish-test/upload-probe.mp4",
);

function writeProbeCover(): string {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const path = join(tmpdir(), `pugying-bili-cover-${Date.now()}.png`);
  writeFileSync(path, png);
  return path;
}

it("uploadVideo runs preupload → uploads → part PUT → complete", async () => {
  readFileSync(SAMPLE);
  const size = readFileSync(SAMPLE).byteLength;
  const chunkSize = Math.ceil(size / 2);
  const requests: string[] = [];
  const transport: BilibiliVideoHttpTransport = {
    async request(options) {
      requests.push(`${options.method} ${new URL(options.url).pathname}`);
      if (options.url.includes("/preupload?")) {
        expect(options.url).toContain("profile=ugcupos%2Fbup");
        expect(options.url).toContain("version=4.4.1");
        expect(options.url).toContain(`size=${size}`);
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              auth: "auth-token",
              upos_uri: "upos://ugcever/probe-file.mp4",
              biz_id: "987654321",
              endpoint: "//upos-cs-up.example.com",
              endpoints: ["//upos-cs-up.example.com"],
              chunk_size: chunkSize,
              threads: 2,
              put_query: "os=upos&profile=ugcupos%2Fbup",
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("uploads&output=json")) {
        expect(options.headers["X-Upos-Auth"]).toBe("auth-token");
        expect(options.headers.Cookie).toBeUndefined();
        expect(options.url).toContain(
          "https://upos-cs-up.example.com/ugcever/probe-file.mp4",
        );
        expect(options.url).toContain("profile=ugcupos%2Fbup");
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ upload_id: "upload-abc" }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("partNumber=")) {
        expect(options.method).toBe("PUT");
        expect(options.headers["X-Upos-Auth"]).toBe("auth-token");
        expect(options.headers.Cookie).toBeUndefined();
        expect(options.url).toContain("profile=ugcupos%2Fbup");
        expect(options.body?.byteLength).toBeGreaterThan(0);
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ OK: 1 }), "utf8"),
          headers: {},
        };
      }
      if (
        options.method === "POST" &&
        options.url.includes("uploadId=upload-abc") &&
        options.url.includes("biz_id=987654321")
      ) {
        const body = JSON.parse(Buffer.from(options.body!).toString("utf8"));
        expect(body.parts).toEqual([
          { partNumber: 1, eTag: "etag" },
          { partNumber: 2, eTag: "etag" },
        ]);
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ OK: 1 }), "utf8"),
          headers: {},
        };
      }
      throw new Error(`unexpected ${options.method} ${options.url}`);
    },
  };
  const client = new BilibiliVideoClient(
    [{ name: "bili_jct", value: "csrf", domain: ".bilibili.com" }],
    transport,
    5_000,
  );
  await expect(client.uploadVideo(SAMPLE)).resolves.toEqual({
    vid: "987654321",
    fileId: "probe-file",
    duration: expect.any(Number),
    width: expect.any(Number),
    height: expect.any(Number),
    coverUri: "",
  });
  expect(requests.filter((row) => row.startsWith("PUT")).length).toBe(2);
  expect(requests[0]).toMatch(/^GET /);
  expect(requests[1]).toMatch(/^POST /);
});

it("retries UPOS part PUT on 5xx then succeeds", async () => {
  readFileSync(SAMPLE);
  const size = readFileSync(SAMPLE).byteLength;
  const chunkSize = Math.ceil(size / 2);
  const partAttempts = new Map<string, number>();
  const transport: BilibiliVideoHttpTransport = {
    async request(options) {
      if (options.url.includes("/preupload?")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              auth: "auth-token",
              upos_uri: "upos://ugcever/probe-file.mp4",
              biz_id: "987654321",
              endpoint: "//upos-cs-up.example.com",
              endpoints: ["//upos-cs-up.example.com"],
              chunk_size: chunkSize,
              threads: 1,
              chunk_retry: 3,
              chunk_retry_delay: 0,
              put_query: "os=upos&profile=ugcupos%2Fbup",
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("uploads&output=json")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ upload_id: "upload-abc" }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("partNumber=")) {
        const part = new URL(options.url).searchParams.get("partNumber") ?? "";
        const n = (partAttempts.get(part) ?? 0) + 1;
        partAttempts.set(part, n);
        if (part === "1" && n === 1) {
          return {
            status: 500,
            body: Buffer.from("InternalError", "utf8"),
            headers: {},
          };
        }
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ OK: 1 }), "utf8"),
          headers: {},
        };
      }
      if (
        options.method === "POST" &&
        options.url.includes("uploadId=upload-abc")
      ) {
        return {
          status: 200,
          body: Buffer.from(JSON.stringify({ OK: 1 }), "utf8"),
          headers: {},
        };
      }
      throw new Error(`unexpected ${options.method} ${options.url}`);
    },
  };
  const client = new BilibiliVideoClient(
    [{ name: "bili_jct", value: "csrf", domain: ".bilibili.com" }],
    transport,
    5_000,
  );
  await expect(client.uploadVideo(SAMPLE)).resolves.toMatchObject({
    vid: "987654321",
    fileId: "probe-file",
  });
  expect(partAttempts.get("1")).toBe(2);
});

it("maps preupload 601 + v_voucher to verification required (not rate-limit)", async () => {
  readFileSync(SAMPLE);
  const client = new BilibiliVideoClient(
    [{ name: "SESSDATA", value: "x", domain: ".bilibili.com" }],
    {
      async request(options) {
        if (options.url.includes("/preupload?")) {
          return {
            status: 406,
            body: Buffer.from(
              JSON.stringify({
                OK: 0,
                code: 601,
                message: "您上传视频过快，请您稍作休息后再继续",
                detail: { v_voucher: "voucher_test" },
              }),
              "utf8",
            ),
            headers: {},
          };
        }
        throw new Error(`unexpected ${options.url}`);
      },
    },
    5_000,
  );
  await expect(client.uploadVideo(SAMPLE)).rejects.toMatchObject({
    code: "PLATFORM_VERIFICATION_REQUIRED",
    message: "平台需要验证，请到创作者中心完成后再发布",
  });
});

it("uploadImage posts cover data URL to /x/vu/web/cover/up", async () => {
  const coverPath = writeProbeCover();
  const transport: BilibiliVideoHttpTransport = {
    async request(options) {
      expect(options.method).toBe("POST");
      expect(options.url).toContain("/x/vu/web/cover/up?");
      expect(options.url).toContain("csrf=csrf-token");
      const body = Buffer.from(options.body!).toString("utf8");
      expect(body).toContain('name="cover"');
      expect(body).toContain("data:image/png;base64,");
      expect(body).toContain('name="csrf"');
      expect(body).toContain("csrf-token");
      return {
        status: 200,
        body: Buffer.from(
          JSON.stringify({
            code: 0,
            data: { url: "http://i0.hdslb.com/bfs/cover/test.jpg" },
          }),
          "utf8",
        ),
        headers: {},
      };
    },
  };
  const client = new BilibiliVideoClient(
    [{ name: "bili_jct", value: "csrf-token", domain: ".bilibili.com" }],
    transport,
  );
  await expect(client.uploadImage(coverPath)).resolves.toMatchObject({
    url: "https://i0.hdslb.com/bfs/cover/test.jpg",
    width: 1,
    height: 1,
  });
});

it("request add/v3 attaches csrf in query and JSON body", async () => {
  const transport: BilibiliVideoHttpTransport = {
    async request(options) {
      expect(options.url).toContain("/x/vu/web/add/v3?");
      expect(options.url).toContain("web_location=333.1024");
      expect(options.url).toContain("csrf=csrf-token");
      const body = JSON.parse(Buffer.from(options.body!).toString("utf8"));
      expect(body.csrf).toBe("csrf-token");
      expect(body.title).toBe("t");
      return {
        status: 200,
        body: Buffer.from(
          JSON.stringify({
            code: 0,
            data: { aid: "1", bvid: "BV1xx411c7mD" },
          }),
          "utf8",
        ),
        headers: {},
      };
    },
  };
  const client = new BilibiliVideoClient(
    [{ name: "bili_jct", value: "csrf-token", domain: ".bilibili.com" }],
    transport,
  );
  await expect(
    client.request("/x/vu/web/add/v3", { title: "t" }),
  ).resolves.toMatchObject({ code: 0 });
});
