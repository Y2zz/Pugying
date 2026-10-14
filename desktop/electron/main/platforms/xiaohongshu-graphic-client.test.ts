import { XiaohongshuGraphicClient } from "./xiaohongshu-graphic-client";
import type { AgentCookie } from "../protocol";

const cookies: AgentCookie[] = [
  { name: "a1", value: "1a0f9f0d012345678901234567890123456789012345678901" },
  { name: "webId", value: "web" },
];

it("uploads via creator permit + ROS PUT then creates a signed note", async () => {
  const requests: Array<{ url: string; method: string; headers: Record<string, string> }> =
    [];
  const png = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
    0, 0, 1, 8, 2, 0, 0, 0, 0x90, 0x77, 0x53, 0xde, 0, 0, 0, 0, 73, 69, 78, 68,
    0xae, 0x42, 0x60, 0x82,
  ]);
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const path = `/tmp/pugying-xhs-graphic-${Date.now()}.png`;
  writeFileSync(path, png);
  try {
    const client = new XiaohongshuGraphicClient(cookies, {
      async request(options) {
        requests.push({
          url: options.url,
          method: options.method,
          headers: options.headers,
        });
        if (options.url.includes("/upload/web/permit")) {
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                code: 0,
                success: true,
                data: {
                  uploadTempPermits: [
                    {
                      token: "tok",
                      fileIds: ["spectrum/file-a"],
                      uploadAddr: "ros-upload-d4.xhscdn.com",
                    },
                  ],
                },
              }),
            ),
          };
        }
        if (options.url.includes("ros-upload") && options.method === "PUT") {
          expect(options.headers["X-Cos-Security-Token"]).toBe("tok");
          return {
            status: 200,
            body: new Uint8Array(),
            headers: { "x-ros-preview-url": "https://preview.example/a" },
          };
        }
        if (options.url.includes("/web_api/sns/v2/note")) {
          expect(options.headers["x-s"]?.startsWith("XYS_")).toBe(true);
          expect(options.headers["x-t"]).toMatch(/^\d+$/);
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                success: true,
                data: { id: "6ac000000000000000000004" },
              }),
            ),
          };
        }
        throw new Error(`unexpected ${options.method} ${options.url}`);
      },
    });
    const uploaded = await client.uploadImage(path);
    expect(uploaded.uri).toBe("spectrum/file-a");
    expect(uploaded.width).toBeGreaterThan(0);
    const note = await client.createNote({
      common: { type: "normal", title: "t", desc: "d" },
      image_info: { images: [{ file_id: uploaded.uri }] },
      video_info: null,
    });
    expect(note.id).toBe("6ac000000000000000000004");
    expect(requests.map((r) => r.method)).toEqual(["GET", "PUT", "POST"]);
  } finally {
    unlinkSync(path);
  }
});
