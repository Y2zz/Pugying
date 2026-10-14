import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ephemeral-cookie-session", () => ({
  cookieSessionJsonGet: vi.fn(),
  withEphemeralCookieSession: vi.fn(),
}));

import { bilibiliSignedGet, readBilibiliNav } from "./bilibili-cookie-api";
import { cookieSessionJsonGet } from "./ephemeral-cookie-session";

describe("bilibili cookie WBI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("readBilibiliNav extracts mid and wbi keys", async () => {
    vi.mocked(cookieSessionJsonGet).mockResolvedValue({
      code: 0,
      data: {
        isLogin: true,
        mid: 42,
        wbi_img: {
          img_url: "https://i0.hdslb.com/bfs/wbi/abc123.png",
          sub_url: "https://i0.hdslb.com/bfs/wbi/def456.png",
        },
      },
    });
    await expect(readBilibiliNav({} as never)).resolves.toEqual({
      mid: "42",
      imageKey: "abc123",
      subKey: "def456",
    });
  });

  it("bilibiliSignedGet attaches w_rid query signature", async () => {
    vi.mocked(cookieSessionJsonGet).mockImplementation(async (_s, url) => {
      expect(url).toMatch(
        /^https:\/\/api\.bilibili\.com\/x\/topic\/pub\/search\?/,
      );
      expect(url).toContain("w_rid=");
      expect(url).toContain("wts=");
      expect(url).toContain("keywords=t");
      return { code: 0, data: {} };
    });

    await expect(
      bilibiliSignedGet(
        {} as never,
        "/x/topic/pub/search",
        {
          keywords: "t",
          page_size: "20",
          page_num: "1",
          offset: "0",
        },
        { imageKey: "img", subKey: "sub" },
      ),
    ).resolves.toEqual({ code: 0, data: {} });
  });
});
