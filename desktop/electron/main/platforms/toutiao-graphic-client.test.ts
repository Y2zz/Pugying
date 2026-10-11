import { ToutiaoGraphicClient } from "./toutiao-graphic-client";

it("uploads multipart image and posts wtt payload over Cookie HTTP", async () => {
  const requests: Array<{ url: string; method: string; headers: Record<string, string> }> =
    [];
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
    0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "toutiao-graphic-"));
  const path = join(dir, "a.png");
  writeFileSync(path, png);

  const client = new ToutiaoGraphicClient(
    [{ name: "sessionid", value: "s1" }],
    {
      async request(options) {
        requests.push({
          url: options.url,
          method: options.method,
          headers: options.headers,
        });
        if (options.url.includes("/spice/image")) {
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                code: 0,
                data: {
                  origin_image_uri: "tos/uri-a",
                  origin_image_url: "https://p3.toutiaoimg.com/a",
                  image_width: 1,
                  image_height: 1,
                },
              }),
              "utf8",
            ),
          };
        }
        return {
          status: 200,
          body: Buffer.from(
            JSON.stringify({
              code: 0,
              data: { thread_id: "1878587025638400" },
            }),
            "utf8",
          ),
        };
      },
    },
  );

  const uploaded = await client.uploadImage(path);
  expect(uploaded.uri).toBe("tos/uri-a");
  expect(requests[0]?.url).toContain("/spice/image?upload_source=20020004");
  expect(requests[0]?.headers.Cookie).toContain("sessionid=s1");
  expect(requests[0]?.headers["Content-Type"]).toMatch(/^multipart\/form-data/);

  const created = await client.createWtt({
    content: "标题\n\n正文",
    image_list: [uploaded.uri],
    pre_upload: 1,
    entrance: "main",
    extra: "{}",
  });
  expect(created.code).toBe(0);
  expect(requests[1]?.url).toContain("/mp/agw/article/wtt?");
  expect(requests[1]?.headers["Content-Type"]).toContain("application/json");
  await client.dispose();
});
