// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import {
  packArticleRecovery,
  hasArticleRecoveryContent,
  readArticleRecovery,
  removeArticleRecovery,
  restoreArticleRecovery,
  writeArticleRecovery,
  type ArticleRecoveryData,
} from "./article-recovery-store";
import { emptyArticleDraft, emptyCoverPair } from "./helpers";

const makeData = (): ArticleRecoveryData => ({
  title: "未完成的文章",
  body: "<p>正文</p>",
  selected: { account: true },
  drafts: { account: emptyArticleDraft() },
  covers: emptyCoverPair(),
  legacyMediaPaths: [],
  createdContentId: null,
});

it("does not count blank paragraphs or account choices as article content", () => {
  const data = {
    ...makeData(),
    title: "  ",
    body: "<p><br></p><p>&nbsp; \u200b</p>",
  };
  expect(hasArticleRecoveryContent(data)).toBe(false);
  expect(hasArticleRecoveryContent({ ...data, title: "标题" })).toBe(true);
  expect(hasArticleRecoveryContent({ ...data, body: "<p>正文</p>" })).toBe(
    true,
  );
  expect(
    hasArticleRecoveryContent({
      ...data,
      body: '<p><img src="file:///test.jpg"></p>',
    }),
  ).toBe(true);
  expect(
    hasArticleRecoveryContent({
      ...data,
      covers: {
        ...data.covers,
        portrait: { ...data.covers.portrait, blob: new Blob(["cover"]) },
      },
    }),
  ).toBe(true);
});

it("persists account settings and cover bytes without transient preview URLs", async () => {
  const data = makeData();
  const blob = new NodeBlob(["cover"], {
    type: "image/png",
  }) as unknown as Blob;
  data.covers.portrait = {
    blob,
    previewUrl: "blob:old",
    sourceUrl: "blob:source",
    saved: false,
  };
  data.drafts.account.articleSettings = {
    summary: "摘要",
    comments: "selected",
  };
  data.drafts.account.extraCovers = [
    { blob, previewUrl: "blob:extra", sourceUrl: "", saved: false },
  ];
  await writeArticleRecovery("blob-test", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: packArticleRecovery(data),
  });
  const record = await readArticleRecovery("blob-test");
  expect(record?.data.covers.portrait.previewUrl).toBe("");
  expect(record?.data.covers.portrait.blob?.size).toBe(5);
  expect(record?.data.drafts.account.articleSettings).toEqual({
    summary: "摘要",
    comments: "selected",
  });
  expect(record?.data.drafts.account.extraCovers?.[0].blob?.size).toBe(5);
});

it("serializes outstanding writes before deleting a saved recovery record", async () => {
  const record = {
    version: 1 as const,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: makeData(),
  };
  const writes = [
    writeArticleRecovery("ordered", record),
    writeArticleRecovery("ordered", {
      ...record,
      data: { ...record.data, title: "最新" },
    }),
  ];
  const remove = removeArticleRecovery("ordered");
  await Promise.all([...writes, remove]);
  expect(await readArticleRecovery("ordered")).toBeUndefined();
});

it("rebuilds cover previews and keeps server covers that were not edited", () => {
  const data = makeData();
  data.covers.portrait = {
    blob: new Blob(["cover"]),
    previewUrl: "",
    sourceUrl: "",
    saved: false,
  };
  data.covers.landscape.saved = true;
  const base = makeData();
  base.covers.landscape = {
    blob: null,
    previewUrl: "blob:server",
    sourceUrl: "",
    saved: true,
  };
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL() {
        return "blob:restored";
      }
    },
  );
  const track = vi.fn((url: string) => url);
  const restored = restoreArticleRecovery(data, base, track);
  expect(restored.covers.portrait.previewUrl).toBe("blob:restored");
  expect(restored.covers.landscape.previewUrl).toBe("blob:server");
  expect(track).toHaveBeenCalledWith("blob:restored");
  vi.unstubAllGlobals();
});
