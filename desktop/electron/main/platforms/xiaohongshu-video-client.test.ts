import { copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { XiaohongshuVideoClient } from "./xiaohongshu-video-client";

const COOKIES = [
  { name: "a1", value: "1a0f9f0d012345678901234567890123456789012345678901" },
  { name: "webId", value: "web" },
];

const SAMPLE = join(
  process.cwd(),
  "../output/video-publish-test/upload-probe.mp4",
);

it("uploads via permit/ROS then polls snake_case query_transcode for first frame", async () => {
  const videoPath = join(tmpdir(), `pugying-xhs-video-${Date.now()}.mp4`);
  copyFileSync(SAMPLE, videoPath);
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
      if (options.url.includes("/upload/web/permit")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              success: true,
              code: 0,
              data: {
                uploadTempPermits: [
                  {
                    fileIds: ["spectrum/file-1"],
                    token: "tok",
                    uploadAddr: "ros-upload.example.com",
                  },
                ],
              },
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("ros-upload") && options.method === "PUT") {
        return {
          status: 200,
          body: Buffer.from(""),
          headers: { "x-ros-video-id": "138144985481771762" },
        };
      }
      if (options.url.includes("/capa/postgw/videoid")) {
        expect(options.url).toContain("file_key=");
        expect(options.url).toContain("biz_name=217");
        expect(options.headers["x-s"]).toMatch(/^XYS_/);
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              success: true,
              code: 0,
              data: { video_id: "138144985496705477" },
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("/capa/postgw/query_transcode")) {
        expect(options.url).toContain("video_id=");
        expect(options.url).toContain("need_transcode=false");
        expect(options.headers["x-s"]).toMatch(/^XYS_/);
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              success: true,
              code: 0,
              data: {
                has_first_frame: true,
                first_frame_file_id: "frame/cover-1.jpg",
                query_interval_ms: 3000,
                max_unchanged_query_times: 100,
              },
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      return {
        status: 200,
        body: Buffer.from("{}", "utf8"),
        headers: {},
      };
    }),
  };
  const client = new XiaohongshuVideoClient(COOKIES, transport, 5000);
  const uploaded = await client.uploadVideo(videoPath);
  expect(uploaded).toMatchObject({
    vid: "138144985496705477",
    fileId: "spectrum/file-1",
    coverUri: "frame/cover-1.jpg",
    width: 640,
    height: 360,
  });
  expect(uploaded.duration).toBeGreaterThan(0);
  expect(uploaded.originalMetadata?.video).toMatchObject({ Format: "AVC" });
  expect(requests.some((item) => item.includes("query_transcode"))).toBe(true);
  expect(requests.some((item) => item.includes("?uploads"))).toBe(false);
  await client.dispose();
});

it("ROS uses a single PUT with video/mp4 for files within the part size", async () => {
  const videoPath = join(tmpdir(), `pugying-xhs-video-mp-${Date.now()}.mp4`);
  copyFileSync(SAMPLE, videoPath);
  const requests: string[] = [];
  const transport = {
    request: vi.fn(async (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: Uint8Array;
    }) => {
      requests.push(`${options.method} ${options.url}`);
      if (options.url.includes("/upload/web/permit")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              success: true,
              code: 0,
              data: {
                uploadTempPermits: [
                  {
                    fileIds: ["spectrum/file-mp"],
                    token: "tok-mp",
                    uploadAddr: "ros-upload.example.com",
                  },
                ],
              },
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("ros-upload") && options.method === "PUT") {
        expect(options.headers["X-Cos-Security-Token"]).toBe("tok-mp");
        expect(options.headers["Content-Type"]).toBe("video/mp4");
        expect(options.headers.Origin).toBeUndefined();
        expect(options.headers.Cookie).toBeUndefined();
        expect(options.url.includes("?uploads")).toBe(false);
        expect(options.body).toBeInstanceOf(Uint8Array);
        expect(options.body!.byteLength).toBeGreaterThan(0);
        return {
          status: 200,
          body: Buffer.from(""),
          headers: { "x-ros-video-id": "138144985481771762" },
        };
      }
      if (options.url.includes("/capa/postgw/videoid")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              success: true,
              code: 0,
              data: { video_id: "138144985496705477" },
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("/capa/postgw/query_transcode")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              success: true,
              code: 0,
              data: {
                has_first_frame: true,
                first_frame_file_id: "frame/cover-1.jpg",
              },
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      throw new Error(`unexpected ${options.method} ${options.url}`);
    }),
  };
  const client = new XiaohongshuVideoClient(COOKIES, transport, 5000);
  await expect(client.uploadVideo(videoPath)).resolves.toMatchObject({
    vid: "138144985496705477",
    fileId: "spectrum/file-mp",
  });
  expect(requests.filter((item) => item.startsWith("PUT ")).length).toBe(1);
  expect(requests.some((item) => item.includes("?uploads"))).toBe(false);
  expect(requests.some((item) => item.includes("partNumber="))).toBe(false);
  await client.dispose();
});

it("ROS switches to multipart upload for files larger than the part size", async () => {
  const videoPath = join(tmpdir(), `pugying-xhs-video-parts-${Date.now()}.mp4`);
  copyFileSync(SAMPLE, videoPath);
  const requests: string[] = [];
  const partSizes: number[] = [];
  let completeXml = "";
  const transport = {
    request: vi.fn(async (options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: Uint8Array;
    }) => {
      requests.push(`${options.method} ${options.url}`);
      if (options.url.includes("/upload/web/permit")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              success: true,
              code: 0,
              data: {
                uploadTempPermits: [
                  {
                    fileIds: ["spectrum/file-parts"],
                    token: "tok-parts",
                    uploadAddr: "ros-upload.example.com",
                  },
                ],
              },
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.endsWith("/spectrum/file-parts?uploads")) {
        expect(options.method).toBe("POST");
        expect(options.headers["Content-Type"]).toBeUndefined();
        return {
          status: 200,
          body: Buffer.from(
            "<InitiateMultipartUploadResult><UploadId>up-1</UploadId></InitiateMultipartUploadResult>",
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("partNumber=") && options.method === "PUT") {
        expect(options.url).toContain("uploadId=up-1");
        expect(options.headers["X-Cos-Security-Token"]).toBe("tok-parts");
        partSizes.push(options.body!.byteLength);
        const n = /partNumber=(\d+)/.exec(options.url)![1];
        return { status: 200, body: Buffer.from(""), headers: { etag: `"e${n}"` } };
      }
      if (options.url.endsWith("?uploadId=up-1") && options.method === "POST") {
        completeXml = Buffer.from(options.body!).toString("utf8");
        return {
          status: 200,
          body: Buffer.from("<CompleteMultipartUploadResult/>", "utf8"),
          headers: { "x-ros-video-id": "138144985481771762" },
        };
      }
      if (options.url.includes("/capa/postgw/videoid")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ success: true, code: 0, data: { video_id: "138144985496705477" } }),
            "utf8",
          ),
          headers: {},
        };
      }
      if (options.url.includes("/capa/postgw/query_transcode")) {
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              success: true,
              code: 0,
              data: { has_first_frame: true, first_frame_file_id: "frame/cover-1.jpg" },
            }),
            "utf8",
          ),
          headers: {},
        };
      }
      throw new Error(`unexpected ${options.method} ${options.url}`);
    }),
  };
  const client = new XiaohongshuVideoClient(COOKIES, transport, 5000, 1024);
  await expect(client.uploadVideo(videoPath)).resolves.toMatchObject({
    vid: "138144985496705477",
    fileId: "spectrum/file-parts",
  });
  expect(partSizes).toEqual([1024, 1024, 1024, 214]);
  expect(completeXml).toContain("<PartNumber>4</PartNumber><ETag>\"e4\"</ETag>");
  expect(requests.some((item) => item.startsWith("PUT ") && !item.includes("partNumber="))).toBe(false);
  await client.dispose();
});

it("re-signs and retries the note POST when edith answers 461", async () => {
  const signatures: string[] = [];
  let calls = 0;
  const transport = {
    request: vi.fn(async (options: { url: string; method: string; headers: Record<string, string> }) => {
      expect(options.url).toBe("https://edith.xiaohongshu.com/web_api/sns/v2/note");
      signatures.push(`${options.headers["x-s"]}|${options.headers["x-t"]}`);
      calls += 1;
      if (calls < 3) {
        return { status: 461, body: Buffer.from(""), headers: {} };
      }
      return {
        status: 200,
        body: Buffer.from(JSON.stringify({ success: true, data: { id: "6acbc80400000000130192a1" } }), "utf8"),
        headers: {},
      };
    }),
  };
  const client = new XiaohongshuVideoClient(COOKIES, transport, 5000, undefined, 1);
  await expect(client.request("/web_api/sns/v2/note", { common: { title: "t" } })).resolves.toMatchObject({ success: true });
  expect(calls).toBe(3);
  expect(new Set(signatures).size).toBe(3);
});

it("gives up with PLATFORM_REJECTED after repeated 461", async () => {
  const transport = {
    request: vi.fn(async () => ({ status: 461, body: Buffer.from(""), headers: {} })),
  };
  const client = new XiaohongshuVideoClient(COOKIES, transport, 5000, undefined, 1);
  await expect(client.request("/web_api/sns/v2/note", { common: {} })).rejects.toMatchObject({ code: "PLATFORM_REJECTED" });
  expect(transport.request).toHaveBeenCalledTimes(4);
});
