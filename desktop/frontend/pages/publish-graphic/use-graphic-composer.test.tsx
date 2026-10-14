// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useGraphicComposer } from "./use-graphic-composer";
import {
  createContent,
  updateContent,
  uploadContentCover,
  fetchPlatformAccounts,
  fetchContent,
  type ContentItem,
  type PlatformAccountItem,
} from "@/lib/api";
import { submitDistribution } from "@/lib/distribution";
import { toast } from "@/components/AppToaster";
import { emptyArticleDraft } from "../publish-article/helpers";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/lib/distribution", () => ({ submitDistribution: vi.fn() }));
vi.mock("@/components/AppToaster", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchPlatformCatalog: vi.fn().mockResolvedValue([]),
  fetchPlatformAccounts: vi.fn().mockResolvedValue([]),
  createContent: vi.fn(),
  updateContent: vi.fn(),
  uploadContentCover: vi.fn(),
  fetchContent: vi.fn(),
}));

const savedItem = {
  id: "saved-graphic",
  type: "graphic",
  status: "draft",
  targets: [],
} as unknown as ContentItem;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([]);
  vi.mocked(createContent).mockResolvedValue(savedItem);
  vi.mocked(updateContent).mockResolvedValue(savedItem);
  vi.mocked(uploadContentCover).mockResolvedValue(savedItem);
  vi.mocked(submitDistribution).mockResolvedValue(undefined);
});

async function readyToPublish(
  platform: "douyin" | "toutiao" | "xiaohongshu" = "douyin",
) {
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([
    {
      id: "a",
      displayName: "抖音账号",
      platform,
      status: "active",
    } as PlatformAccountItem,
  ]);
  vi.stubGlobal("pugyingDesktop", {
    available: true,
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    checkLocalPathReadable: vi.fn().mockResolvedValue(true),
    readLocalImageDataUrl: vi
      .fn()
      .mockResolvedValue("data:image/png;base64,aW1hZ2U="),
  });
  URL.createObjectURL = vi.fn().mockReturnValue("blob:cover");
  URL.revokeObjectURL = vi.fn();
  const hook = renderHook(() => useGraphicComposer(null));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  act(() => {
    hook.result.current.setTitle("图文标题");
    hook.result.current.setBody("图文文案");
    hook.result.current.setMediaPaths(["/tmp/a.png", "/tmp/b.png"]);
    if (platform === "douyin") {
      hook.result.current.onCoverSaved({
        croppedFile: new File(["cover"], "cover.jpg", { type: "image/jpeg" }),
        sourceUrl: "data:image/png;base64,Y292ZXI=",
      });
    }
  });
  await waitFor(() =>
    expect(hook.result.current.checks.every((check) => check.ok)).toBe(true),
  );
  return hook;
}

it.each(["toutiao", "xiaohongshu"] as const)(
  "%s 无需额外封面即可保存并直接提交图文，超过 18 张时阻止发布",
  async (platform) => {
    const { result } = await readyToPublish(platform);
    expect(
      result.current.checks.find((check) => check.id === "cover")?.detail,
    ).toBe("无需单独设置");
    await act(async () => {
      await result.current.save(true);
    });
    expect(uploadContentCover).not.toHaveBeenCalled();
    expect(submitDistribution).toHaveBeenCalledExactlyOnceWith("saved-graphic");
    act(() => {
      result.current.setMediaPaths(Array(19).fill("/tmp/a.png"));
    });
    expect(
      result.current.checks.find((check) => check.id === "images"),
    ).toMatchObject({ ok: false, detail: "最多 18 张图片" });
    await act(async () => {
      expect((await result.current.save(true))?.id).toBe("images");
    });
    expect(submitDistribution).toHaveBeenCalledOnce();
  },
);

it("发布前必须完成全部检查，草稿仍允许缺少内容", async () => {
  const { result } = renderHook(() => useGraphicComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.setTitle("图文草稿"));
  await act(async () => {
    expect((await result.current.save(true))?.id).toBe("body");
  });
  expect(createContent).not.toHaveBeenCalled();
  expect(submitDistribution).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.save();
  });
  expect(createContent).toHaveBeenCalledOnce();
  expect(submitDistribution).not.toHaveBeenCalled();
});

it("先保存图片顺序及封面，再提交分发并反馈成功", async () => {
  const { result } = await readyToPublish();
  await act(async () => {
    await result.current.save(true);
  });
  expect(createContent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "graphic",
      mediaPaths: ["/tmp/a.png", "/tmp/b.png"],
      targets: [expect.objectContaining({ platformAccountId: "a" })],
    }),
  );
  expect(uploadContentCover).toHaveBeenCalledOnce();
  expect(submitDistribution).toHaveBeenCalledExactlyOnceWith("saved-graphic");
  expect(
    vi.mocked(uploadContentCover).mock.invocationCallOrder[0],
  ).toBeLessThan(vi.mocked(submitDistribution).mock.invocationCallOrder[0]);
  expect(toast.add).toHaveBeenCalledWith({
    type: "success",
    title: "已开始分发",
  });
  expect(navigate).toHaveBeenCalledWith("/contents");
  expect(result.current.publishing).toBe(false);
});

it.each(["保存", "封面"])("%s失败时不提交分发", async (stage) => {
  const { result } = await readyToPublish();
  if (stage === "保存") {
    vi.mocked(createContent).mockRejectedValueOnce(new Error("保存失败"));
  } else {
    vi.mocked(uploadContentCover).mockRejectedValueOnce(
      new Error("封面保存失败"),
    );
  }
  await act(async () => {
    await result.current.save(true);
  });
  expect(submitDistribution).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  expect(result.current.error).toBeTruthy();
  expect(result.current.saving).toBe(false);
  expect(result.current.publishing).toBe(false);
});

it("分发提交失败后保留已保存图文，重试更新同一草稿", async () => {
  const { result } = await readyToPublish();
  vi.mocked(submitDistribution).mockRejectedValueOnce(new Error("应用未就绪"));
  await act(async () => {
    await result.current.save(true);
  });
  expect(result.current.error).toBeTruthy();
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.save(true);
  });
  expect(createContent).toHaveBeenCalledOnce();
  expect(updateContent).toHaveBeenCalledExactlyOnceWith(
    "saved-graphic",
    expect.anything(),
  );
  expect(submitDistribution).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenCalledWith("/contents");
});

it("提交期间忽略重复发布与保存，结束后恢复按钮状态", async () => {
  const { result } = await readyToPublish();
  let finish!: () => void;
  vi.mocked(submitDistribution).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let first!: Promise<unknown>;
  await act(async () => {
    first = result.current.save(true);
    await result.current.save(true);
    await result.current.save();
  });
  expect(result.current.publishing).toBe(true);
  expect(result.current.saving).toBe(true);
  expect(createContent).toHaveBeenCalledOnce();
  expect(submitDistribution).toHaveBeenCalledOnce();
  await act(async () => {
    finish();
    await first;
  });
  expect(result.current.publishing).toBe(false);
  expect(result.current.saving).toBe(false);
});

it("载入失败时不允许保存或发布，避免覆盖原内容", async () => {
  vi.mocked(fetchContent).mockRejectedValueOnce(new Error("加载失败"));
  const { result } = renderHook(() => useGraphicComposer("existing"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.save(true);
    await result.current.save();
  });
  expect(updateContent).not.toHaveBeenCalled();
  expect(submitDistribution).not.toHaveBeenCalled();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("用第一张图时将可加载的图片数据传给封面编辑器", async () => {
  const source = "data:image/png;base64,Y292ZXI=";
  const readImage = vi.fn().mockResolvedValue(source);
  vi.stubGlobal("pugyingDesktop", {
    available: true,
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    readLocalImageDataUrl: readImage,
    checkLocalPathReadable: vi.fn().mockResolvedValue(true),
  });
  const { result } = renderHook(() => useGraphicComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.setMediaPaths(["/tmp/图片 #1%.png"]));
  await waitFor(() => expect(result.current.firstImagePreview).toBe(source));
  act(() => result.current.applyFirstImageAsCover());
  expect(result.current.coverEditor).toMatchObject({
    open: true,
    initialSource: source,
  });
  expect(readImage).toHaveBeenCalledWith("/tmp/图片 #1%.png");
});

it("账号单独设置封面后不再标记通用槽位，未选账号时封面要求待定", async () => {
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([
    {
      id: "a",
      displayName: "抖音账号",
      platform: "douyin",
      status: "active",
    } as PlatformAccountItem,
  ]);
  const { result } = renderHook(() => useGraphicComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.missingCommonCoverAspects).toEqual(["portrait"]);
  const draft = emptyArticleDraft();
  draft.covers.portrait.saved = true;
  act(() => result.current.setDraft("a", draft));
  expect(result.current.missingCommonCoverAspects).toEqual([]);
  expect(result.current.checks.find((check) => check.id === "cover")?.ok).toBe(
    true,
  );
  act(() => result.current.setSelected({}));
  expect(
    result.current.checks.find((check) => check.id === "cover"),
  ).toMatchObject({
    ok: true,
    detail: "选定账号后设置",
  });
});
