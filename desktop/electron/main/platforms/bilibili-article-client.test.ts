import { writeFileSync, unlinkSync } from "node:fs";
import { BilibiliArticleClient } from "./bilibili-article-client";
import type { AgentCookie } from "../protocol";

const cookies: AgentCookie[] = [
  { name: "SESSDATA", value: "sess" },
  { name: "bili_jct", value: "csrf-token" },
  { name: "DedeUserID", value: "123" },
];

const png = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0,
  0, 1, 8, 2, 0, 0, 0, 0x90, 0x77, 0x53, 0xde, 0, 0, 0, 0, 73, 69, 78, 68, 0xae,
  0x42, 0x60, 0x82,
]);

it("signs WBI, uploads bfs, and posts opus with csrf", async () => {
  const path = `/tmp/pugying-bili-article-${Date.now()}.png`;
  writeFileSync(path, png);
  try {
    const client = new BilibiliArticleClient(cookies, {
      async request(options) {
        if (options.url.includes("/x/web-interface/nav")) {
          // Chromium 会取消带 query 的跨站 Referer；Referer 不得含 ?
          expect(options.headers.Referer).toBe("https://member.bilibili.com/");
          expect(options.headers.Referer).not.toContain("?");
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                code: 0,
                data: {
                  isLogin: true,
                  mid: 123,
                  wbi_img: {
                    img_url:
                      "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
                    sub_url:
                      "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
                  },
                },
              }),
            ),
            headers: {},
          };
        }
        if (options.url.includes("/upload_bfs")) {
          expect(options.url).toContain("w_rid=");
          expect(options.method).toBe("POST");
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                code: 0,
                data: {
                  image_url: "https://i0.hdslb.com/bfs/new_dyn/a.png",
                  image_width: 1,
                  image_height: 1,
                  img_size: 1,
                },
              }),
            ),
            headers: {},
          };
        }
        // opus_init_check 路径含 create/opus 前缀，须先于 create/opus 判断
        if (options.url.includes("opus_init_check")) {
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                code: 0,
                data: {
                  config: { max_title_len: 40 },
                  verify: {},
                },
              }),
            ),
            headers: {},
          };
        }
        if (options.url.includes("/create/opus?")) {
          expect(options.url).toContain("csrf=csrf-token");
          expect(options.url).toContain("dm_img_switch=0");
          expect(options.url).toContain("w_rid=");
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify({
                code: 0,
                message: "OK",
                data: { dyn_id_str: "1257524849050386434" },
              }),
            ),
            headers: {},
          };
        }
        throw new Error(`unexpected ${options.method} ${options.url}`);
      },
    });
    const uploaded = await client.uploadImage(path);
    expect(uploaded.url).toContain("hdslb.com");
    const init = await client.request(
      "/x/dynamic/feed/create/opus_init_check?editor_version=eva3-4.0.0",
    );
    expect(init.code).toBe(0);
    const created = await client.request("/x/dynamic/feed/create/opus", {
      opus_req: { scene: 12 },
    });
    expect(created.data).toMatchObject({ dyn_id_str: "1257524849050386434" });
  } finally {
    unlinkSync(path);
  }
});
