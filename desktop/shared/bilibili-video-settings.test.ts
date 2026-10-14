import { parseBilibiliVideoOptions } from "./bilibili-video-settings";

it("keeps only publishable leaf partitions and current account statements", () => {
  expect(
    parseBilibiliVideoOptions({
      isLogin: true,
      typelist: [
        {
          id: 1,
          name: "生活",
          children: [
            { id: 21, name: "日常" },
            { id: "22", name: "invalid" },
          ],
        },
      ],
      neutral_mark: {
        mark_list: [
          { id: 123, content: "人工智能生成内容" },
          { id: 0, content: "invalid" },
        ],
      },
    }),
  ).toEqual({
    partitions: [{ id: 21, name: "日常", group: "生活" }],
    declarations: [{ id: 123, content: "人工智能生成内容" }],
  });
});

it("does not invent options for a signed-out or changed account response", () => {
  expect(
    parseBilibiliVideoOptions({ isLogin: false, typelist: [] }),
  ).toBeNull();
  expect(parseBilibiliVideoOptions({ isLogin: true })).toBeNull();
  expect(parseBilibiliVideoOptions({ isLogin: true, typelist: [] })).toEqual({
    partitions: [],
    declarations: [],
  });
});
