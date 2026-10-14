import { expect, it } from "vitest";
import {
  parseToutiaoRewardFromPublishHtml,
  parseToutiaoRewardPrivilege,
} from "./toutiao-article-privileges";

it.each([0, 1, 3, 5])(
  "uses the actual remaining count %s without a fixed daily allowance",
  (count) => {
    expect(
      parseToutiaoRewardPrivilege(`允许赞赏（今日还有${count}次机会）`, false),
    ).toMatchObject({
      remainingToday: count,
      available: count > 0,
    });
  },
);
it("respects platform disabling even when remaining count is positive", () => {
  expect(
    parseToutiaoRewardPrivilege("允许赞赏（今日还有2次机会）", true)?.available,
  ).toBe(false);
});
it("preserves platform text and never invents an absent count", () => {
  expect(parseToutiaoRewardPrivilege("允许赞赏", false)).toMatchObject({
    label: "允许赞赏",
    remainingToday: null,
  });
  expect(
    parseToutiaoRewardPrivilege("允许赞赏（今日还有 2 次机会）", false)
      ?.remainingToday,
  ).toBe(2);
  expect(parseToutiaoRewardPrivilege("请登录", false)).toBeNull();
});

it("parses praise_count_remained from publish page bootstrap HTML", () => {
  const html = `<script>var x={"creator_project_info":{"creator_project_banned_flag":false,"praise_count_remained":5},"other":1}</script>`;
  expect(parseToutiaoRewardFromPublishHtml(html)).toMatchObject({
    label: "允许赞赏（今日还有5次机会）",
    remainingToday: 5,
    available: true,
  });
});

it("marks banned creator projects unavailable", () => {
  const html =
    '{"creator_project_info":{"creator_project_banned_flag":true,"praise_count_remained":3}}';
  expect(parseToutiaoRewardFromPublishHtml(html)).toMatchObject({
    remainingToday: 3,
    available: false,
  });
});

it("returns null when bootstrap payload is missing", () => {
  expect(parseToutiaoRewardFromPublishHtml("<html></html>")).toBeNull();
});
