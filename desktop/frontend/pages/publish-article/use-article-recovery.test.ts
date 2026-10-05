// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { emptyCoverPair } from "./helpers";
import {
  readArticleRecovery,
  writeArticleRecovery,
  type ArticleRecoveryData,
} from "./article-recovery-store";
import * as recoveryStore from "./article-recovery-store";
import { useArticleRecovery } from "./use-article-recovery";

const data: ArticleRecoveryData = {
  title: "",
  body: "",
  selected: {},
  drafts: {},
  covers: emptyCoverPair(),
  legacyMediaPaths: [],
  createdContentId: null,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("restores only a recovery snapshot based on the current server revision", async () => {
  const snapshot = { ...data, title: "恢复标题" };
  await writeArticleRecovery("revision-test", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "old",
    data: snapshot,
  });
  const onRestore = vi.fn();
  const hook = renderHook(() =>
    useArticleRecovery({
      key: "revision-test",
      enabled: true,
      baseUpdatedAt: "new",
      data,
      onRestore,
    }),
  );
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(onRestore).not.toHaveBeenCalled();
  hook.unmount();
  const matching = renderHook(() =>
    useArticleRecovery({
      key: "revision-test",
      enabled: true,
      baseUpdatedAt: "old",
      data,
      onRestore,
    }),
  );
  await waitFor(() => expect(matching.result.current.ready).toBe(true));
  expect(onRestore).toHaveBeenCalledWith(snapshot);
});

it("flushes the latest edits on navigation and does not recreate a discarded record", async () => {
  const hook = renderHook(
    ({ value }) =>
      useArticleRecovery({
        key: "flush-test",
        enabled: true,
        baseUpdatedAt: "",
        data: value,
        onRestore: vi.fn(),
      }),
    { initialProps: { value: data } },
  );
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  hook.rerender({ value: { ...data, title: "最新标题" } });
  hook.unmount();
  await waitFor(async () =>
    expect((await readArticleRecovery("flush-test"))?.data.title).toBe(
      "最新标题",
    ),
  );
  const next = renderHook(
    ({ value }) =>
      useArticleRecovery({
        key: "discard-test",
        enabled: true,
        baseUpdatedAt: "",
        data: value,
        onRestore: vi.fn(),
      }),
    { initialProps: { value: data } },
  );
  await waitFor(() => expect(next.result.current.ready).toBe(true));
  next.rerender({ value: { ...data, title: "另一个标题" } });
  await act(() => next.result.current.discard());
  next.unmount();
  expect(await readArticleRecovery("discard-test")).toBeUndefined();
});

it("keeps read failures visible and never overwrites an unread recovery copy", async () => {
  const read = vi
    .spyOn(recoveryStore, "readArticleRecovery")
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValue(undefined);
  const write = vi.spyOn(recoveryStore, "writeArticleRecovery");
  const hook = renderHook(
    ({ value }) =>
      useArticleRecovery({
        key: "read-failure",
        enabled: true,
        baseUpdatedAt: "",
        data: value,
        onRestore: vi.fn(),
      }),
    { initialProps: { value: data } },
  );
  await waitFor(() => expect(hook.result.current.failed).toBe(true));
  hook.rerender({ value: { ...data, title: "继续编辑" } });
  expect(hook.result.current.status).toContain("暂不可用");
  expect(write).not.toHaveBeenCalled();
  await act(() => hook.result.current.retry());
  expect(read).toHaveBeenCalledTimes(2);
  read.mockRestore();
  expect((await readArticleRecovery("read-failure"))?.data.title).toBe(
    "继续编辑",
  );
});

it("automatically saves after typing stops without navigating away", async () => {
  const hook = renderHook(
    ({ value }) =>
      useArticleRecovery({
        key: "debounce-test",
        enabled: true,
        baseUpdatedAt: "",
        data: value,
        onRestore: vi.fn(),
      }),
    { initialProps: { value: data } },
  );
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  hook.rerender({ value: { ...data, body: "<p>连续编辑完成</p>" } });
  await waitFor(
    () => expect(hook.result.current.status).toBe("已自动保存到本机"),
    { timeout: 2000 },
  );
  expect((await readArticleRecovery("debounce-test"))?.data.body).toBe(
    "<p>连续编辑完成</p>",
  );
});

it("waits for the user to continue and keeps the local draft intact before the choice", async () => {
  const snapshot = { ...data, title: "未完成的文章", body: "<p>正文</p>" };
  await writeArticleRecovery("ask-continue", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: snapshot,
  });
  const onRestore = vi.fn();
  const hook = renderHook(() =>
    useArticleRecovery({
      key: "ask-continue",
      enabled: true,
      baseUpdatedAt: "",
      data,
      askBeforeRestore: true,
      onRestore,
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.pendingRecovery).not.toBeNull(),
  );
  expect(hook.result.current.ready).toBe(false);
  expect(onRestore).not.toHaveBeenCalled();
  await act(() => hook.result.current.retry());
  expect((await readArticleRecovery("ask-continue"))?.data).toEqual(snapshot);
  act(() => hook.result.current.continueRecovery());
  expect(onRestore).toHaveBeenCalledWith(snapshot);
  expect(hook.result.current.ready).toBe(true);
  expect(hook.result.current.pendingRecovery).toBeNull();
});

it("enters a blank editor without offering to restore an empty local draft", async () => {
  await writeArticleRecovery("ask-empty", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: {
      ...data,
      title: " ",
      body: "<p><br></p><p>&nbsp;</p>",
      selected: { account: true },
    },
  });
  const onRestore = vi.fn();
  const hook = renderHook(() =>
    useArticleRecovery({
      key: "ask-empty",
      enabled: true,
      baseUpdatedAt: "",
      data,
      askBeforeRestore: true,
      onRestore,
    }),
  );
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.pendingRecovery).toBeNull();
  expect(onRestore).not.toHaveBeenCalled();
});

it("leaving before making a choice preserves the local draft", async () => {
  const snapshot = { ...data, title: "留待下次编辑" };
  await writeArticleRecovery("ask-leave", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: snapshot,
  });
  const hook = renderHook(() =>
    useArticleRecovery({
      key: "ask-leave",
      enabled: true,
      baseUpdatedAt: "",
      data,
      askBeforeRestore: true,
      onRestore: vi.fn(),
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.pendingRecovery).not.toBeNull(),
  );
  hook.unmount();
  expect((await readArticleRecovery("ask-leave"))?.data).toEqual(snapshot);
});

it("starting new removes the old recovery and automatically saves the new article", async () => {
  await writeArticleRecovery("ask-new", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: { ...data, title: "旧文章" },
  });
  const onRestore = vi.fn();
  const hook = renderHook(
    ({ value }) =>
      useArticleRecovery({
        key: "ask-new",
        enabled: true,
        baseUpdatedAt: "",
        data: value,
        askBeforeRestore: true,
        onRestore,
      }),
    { initialProps: { value: data } },
  );
  await waitFor(() =>
    expect(hook.result.current.pendingRecovery).not.toBeNull(),
  );
  await act(() => hook.result.current.startNew());
  expect(onRestore).not.toHaveBeenCalled();
  expect(hook.result.current.ready).toBe(true);
  expect(await readArticleRecovery("ask-new")).toBeUndefined();
  hook.rerender({ value: { ...data, title: "新文章" } });
  await waitFor(
    () => expect(hook.result.current.status).toBe("已自动保存到本机"),
    { timeout: 2000 },
  );
  expect((await readArticleRecovery("ask-new"))?.data.title).toBe("新文章");
});

it("failed clearing keeps the choice open and allows continuing the original draft", async () => {
  const snapshot = { ...data, title: "保留文章" };
  await writeArticleRecovery("ask-failure", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: snapshot,
  });
  vi.spyOn(recoveryStore, "removeArticleRecovery").mockRejectedValueOnce(
    new Error("unavailable"),
  );
  const onRestore = vi.fn();
  const hook = renderHook(() =>
    useArticleRecovery({
      key: "ask-failure",
      enabled: true,
      baseUpdatedAt: "",
      data,
      askBeforeRestore: true,
      onRestore,
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.pendingRecovery).not.toBeNull(),
  );
  await act(() => hook.result.current.startNew());
  expect(hook.result.current.ready).toBe(false);
  expect(hook.result.current.recoveryError).toBe("新建失败，请重试或继续编辑");
  expect((await readArticleRecovery("ask-failure"))?.data).toEqual(snapshot);
  act(() => hook.result.current.continueRecovery());
  expect(onRestore).toHaveBeenCalledWith(snapshot);
  expect(hook.result.current.recoveryError).toBe("");
});

it("shows the choice after retrying a failed read instead of overwriting the draft", async () => {
  const snapshot = { ...data, title: "重试恢复" };
  await writeArticleRecovery("ask-retry", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: snapshot,
  });
  vi.spyOn(recoveryStore, "readArticleRecovery").mockRejectedValueOnce(
    new Error("unavailable"),
  );
  const onRestore = vi.fn();
  const hook = renderHook(() =>
    useArticleRecovery({
      key: "ask-retry",
      enabled: true,
      baseUpdatedAt: "",
      data,
      askBeforeRestore: true,
      onRestore,
    }),
  );
  await waitFor(() => expect(hook.result.current.failed).toBe(true));
  await act(() => hook.result.current.retry());
  expect(hook.result.current.ready).toBe(false);
  expect(hook.result.current.pendingRecovery?.data).toEqual(snapshot);
  expect(onRestore).not.toHaveBeenCalled();
  expect((await readArticleRecovery("ask-retry"))?.data).toEqual(snapshot);
});

it("does not save on entry or when the editor initializes its empty paragraph", async () => {
  const write = vi.spyOn(recoveryStore, "writeArticleRecovery");
  const hook = renderHook(
    ({ value }) =>
      useArticleRecovery({
        key: "entry-no-change",
        enabled: true,
        baseUpdatedAt: "",
        data: value,
        askBeforeRestore: true,
        onRestore: vi.fn(),
      }),
    { initialProps: { value: data } },
  );
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  hook.rerender({
    value: { ...data, body: "<p></p>", covers: emptyCoverPair() },
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 850));
  });
  expect(write).not.toHaveBeenCalled();
  expect(hook.result.current.status).toBe("");
  hook.unmount();
  expect(await readArticleRecovery("entry-no-change")).toBeUndefined();
});

it("continuing a recovered article is not treated as a new edit", async () => {
  const snapshot = { ...data, title: "恢复标题", body: "<p>原正文</p>" };
  await writeArticleRecovery("restore-no-change", {
    version: 1,
    updatedAt: 1,
    baseUpdatedAt: "",
    data: snapshot,
  });
  const write = vi.spyOn(recoveryStore, "writeArticleRecovery");
  const onRestore = vi.fn();
  const hook = renderHook(
    ({ value }) =>
      useArticleRecovery({
        key: "restore-no-change",
        enabled: true,
        baseUpdatedAt: "",
        data: value,
        askBeforeRestore: true,
        onRestore,
      }),
    { initialProps: { value: data } },
  );
  await waitFor(() =>
    expect(hook.result.current.pendingRecovery).not.toBeNull(),
  );
  act(() => {
    hook.result.current.continueRecovery();
    hook.rerender({ value: { ...snapshot, covers: emptyCoverPair() } });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 850));
  });
  expect(write).not.toHaveBeenCalled();
  expect(hook.result.current.status).toBe("已恢复上次编辑内容");
  hook.unmount();
  expect((await readArticleRecovery("restore-no-change"))?.updatedAt).toBe(1);
});
