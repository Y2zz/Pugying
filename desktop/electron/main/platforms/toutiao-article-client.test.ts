import { writeFileSync, unlinkSync } from "node:fs";
import { ToutiaoArticleClient } from "./toutiao-article-client";
import type { AgentCookie } from "../protocol";

const cookies: AgentCookie[] = [
  { name: "sessionid", value: "sess" },
  { name: "uid_tt", value: "uid" },
];

const png = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0,
  0, 1, 8, 2, 0, 0, 0, 0x90, 0x77, 0x53, 0xde, 0, 0, 0, 0, 73, 69, 78, 68, 0xae,
  0x42, 0x60, 0x82,
]);

it("uploads via article spice source and posts form-urlencoded publish", async () => {
  const path = `/tmp/pugying-tt-article-${Date.now()}.png`;
  writeFileSync(path, png);
  const calls: Array<{ url: string; method: string; contentType?: string }> =
    [];
  try {
    const client = new ToutiaoArticleClient(cookies, {
      async request(options) {
        calls.push({
          url: options.url,
          method: options.method,
          contentType: options.headers["Content-Type"],
        });
        if (options.url.includes("/profile_v4/graphic/publish")) {
          return {
            status: 200,
            body: Buffer.from(
              '"creator_project_info":{"creator_project_banned_flag":false,"praise_count_remained":3}',
            ),
          };
        }
        if (options.url.includes("/spice/image")) {
          expect(options.url).toContain("upload_source=20020003");
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                code: 0,
                data: {
                  origin_image_uri: "tos/uri",
                  origin_image_url: "https://img.example/a.png",
                  image_width: 1,
                  image_height: 1,
                },
              }),
            ),
          };
        }
        if (options.url.includes("/mp/agw/article/new")) {
          return {
            status: 200,
            body: Buffer.from(JSON.stringify({ code: 0, message: "success" })),
          };
        }
        if (options.url.includes("/mp/agw/article/publish")) {
          expect(options.headers["Content-Type"]).toContain(
            "application/x-www-form-urlencoded",
          );
          const text = Buffer.from(options.body!).toString("utf8");
          expect(text).toContain("title=");
          expect(text).toContain("save=1");
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                code: 0,
                message: "提交成功",
                data: { pgc_id: "1000000000000000003" },
              }),
            ),
          };
        }
        throw new Error(`unexpected ${options.method} ${options.url}`);
      },
    });
    const uploaded = await client.uploadImage(path);
    expect(uploaded.uri).toBe("tos/uri");
    const preflight = await client.request(
      "/mp/agw/article/new?article_type=0&format=json&compat=1&column_no=",
    );
    expect(preflight.__pugyingRewardRemaining).toBe(3);
    const published = await client.request(
      "/mp/agw/article/publish?source=mp&type=article&aid=1231&mp_publish_ab_val=0",
      { title: "t", content: "<p>x</p>", save: 1 },
    );
    expect(published.data).toMatchObject({ pgc_id: "1000000000000000003" });
    expect(calls.some((c) => c.url.includes("spice/image"))).toBe(true);
  } finally {
    unlinkSync(path);
  }
});
