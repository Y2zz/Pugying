// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createContent,
  fetchContent,
  fetchPlatformAccounts,
  type PlatformAccountItem,
} from "@/lib/api";
import { CharCountInput } from "../publish-video/CharCountFields";
import { ArticleTitleOverrideField } from "./account-forms/shared-fields";
import {
  countArticleTitleCharacters,
  countArticleAccountTitleCharacters,
  normalizeArticleTitle,
} from "./article-title";
import { articleDraftToOverrides, emptyArticleDraft } from "./helpers";
import { toast } from "@/components/AppToaster";
import { submitDistribution } from "@/lib/distribution";
import { useArticleComposer } from "./use-article-composer";

vi.mock("@/components/AppToaster", () => ({ toast: { add: vi.fn() } }));

vi.mock("@/lib/distribution", () => ({ submitDistribution: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchPlatformCatalog: vi.fn().mockResolvedValue([]),
  fetchPlatformAccounts: vi.fn(),
  createContent: vi.fn(),
  fetchContent: vi.fn(),
}));

const account: PlatformAccountItem = {
  id: "article-account",
  platform: "toutiao",
  displayName: "文章账号",
  platformUserId: null,
  avatarUrl: null,
  status: "active",
  lastAuthedAt: null,
  createdAt: "",
  updatedAt: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([account]);
  vi.mocked(createContent).mockImplementation(async (payload) => ({
    id: "saved-article",
    type: "article",
    title: payload.title,
    body: payload.body ?? null,
    hasCover: false,
    hasCoverLandscape: false,
    mediaPaths: [],
    status: "draft",
    publishedAt: null,
    tags: [],
    location: null,
    visibility: "public",
    scheduledAt: null,
    allowDownload: true,
    targets: [],
    createdAt: "",
    updatedAt: "",
  }));
});
afterEach(cleanup);

it("ignores repeated and full-width whitespace without discarding punctuation or letters", () => {
  expect(countArticleTitleCharacters("  标题   A B！　测试  ")).toBe(7);
  expect(countArticleTitleCharacters("  　\t")).toBe(0);
  expect(countArticleTitleCharacters("标题😀")).toBe(3);
});

it("uses the article counter in the input while preserving the default counter", () => {
  render(
    <>
      <CharCountInput
        value="标   题"
        max={60}
        countCharacters={countArticleTitleCharacters}
        readOnly
      />
      <CharCountInput value="标   题" max={60} readOnly />
    </>,
  );
  expect(screen.getByText("2/60")).toBeTruthy();
  expect(screen.getByText("5/60")).toBeTruthy();
});

it("counts one normalized separator in inherited titles and normalizes overrides on blur", () => {
  const commonTitle = `${"标".repeat(30)}   题`;
  const onChange = vi.fn();
  const view = render(
    <ArticleTitleOverrideField
      accountId="account"
      value=""
      commonTitle={commonTitle}
      max={30}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText("32/30")).toBeTruthy();
  expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
  view.rerender(
    <ArticleTitleOverrideField
      accountId="account"
      value={`${"标".repeat(28)}   题`}
      commonTitle={commonTitle}
      max={30}
      onChange={onChange}
    />,
  );
  expect(screen.getByText("30/30")).toBeTruthy();
  expect(screen.getByRole("textbox").getAttribute("aria-invalid")).not.toBe(
    "true",
  );
  fireEvent.blur(screen.getByRole("textbox"));
  expect(onChange).toHaveBeenCalledWith(`${"标".repeat(28)} 题`);
});

it("normalizes whitespace without altering punctuation, symbols or compound emoji", () => {
  const title = "  Hello　\tworld！✨👩‍💻👨‍👩‍👧‍👦🇨🇳👍🏽  ";
  expect(normalizeArticleTitle(title)).toBe("Hello world！✨👩‍💻👨‍👩‍👧‍👦🇨🇳👍🏽");
  expect(normalizeArticleTitle(" 　 \t\n ")).toBe("");
  expect(normalizeArticleTitle(normalizeArticleTitle(title))).toBe(
    normalizeArticleTitle(title),
  );
  expect(countArticleAccountTitleCharacters("  Hello    world！  ")).toBe(12);
  expect(countArticleTitleCharacters("  Hello    world！  ")).toBe(11);
});

it("normalizes outgoing overrides and treats whitespace-only overrides as inheritance", () => {
  expect(
    articleDraftToOverrides(
      { ...emptyArticleDraft(), title: "  Hello   world！✨👩‍💻  " },
      "toutiao",
    ).title,
  ).toBe("Hello world！✨👩‍💻");
  expect(
    articleDraftToOverrides(
      { ...emptyArticleDraft(), title: " 　 \t " },
      "toutiao",
    ).title,
  ).toBeUndefined();
});

it("saves normalized common and account titles, preserving separators and emoji", async () => {
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    result.current.setTitle(`  Hello${" ".repeat(210)}world！😀  `);
    result.current.setDraft(account.id, {
      ...emptyArticleDraft(),
      title: "  独立   标题✨👩‍💻  ",
    });
  });
  await act(async () => {
    await result.current.save();
  });
  expect(createContent).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Hello world！😀",
      targets: [
        {
          platformAccountId: account.id,
          overrides: expect.objectContaining({ title: "独立 标题✨👩‍💻" }),
        },
      ],
    }),
  );
});

it("keeps the common limit at 60 and validates the effective account title separately", async () => {
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.titleMax).toBe(60);

  act(() => result.current.setTitle(`${"标".repeat(59)}   题`));
  expect(result.current.checks.find((check) => check.id === "title")?.ok).toBe(
    true,
  );
  expect(result.current.accountIssues.get(account.id)).toContain("标题超长");
  expect(result.current.blockingCheck?.id).toBe("accountConfig");

  act(() =>
    result.current.setDraft(account.id, {
      ...emptyArticleDraft(),
      title: "账号   标题",
    }),
  );
  expect(result.current.accountIssues.size).toBe(0);
  expect(result.current.blockingCheck).toBeNull();

  act(() => result.current.setTitle("标".repeat(61)));
  expect(result.current.blockingCheck?.id).toBe("title");

  act(() => result.current.setSelected({}));
  expect(result.current.titleMax).toBe(60);
  expect(result.current.blockingCheck?.id).toBe("title");

  act(() => result.current.setTitle("   　 "));
  expect(result.current.checks.find((check) => check.id === "title")?.ok).toBe(
    false,
  );
  expect(result.current.blockingCheck?.id).toBe("title");
});

it("validates inherited Bilibili titles against its 40-character limit", async () => {
  vi.mocked(fetchPlatformAccounts).mockResolvedValue([
    { ...account, platform: "bilibili" },
  ]);
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.setTitle("标".repeat(40)));
  expect(result.current.accountIssues.size).toBe(0);
  act(() => result.current.setTitle("标".repeat(41)));
  expect(result.current.accountIssues.get(account.id)).toContain("标题超长");
  expect(result.current.titleMax).toBe(60);
});

it("clears saved image paths after deleting the last image from an existing article", async () => {
  const item = await createContent({ type: "article", title: "标题" });
  vi.mocked(fetchContent).mockResolvedValue({
    ...item,
    body: '<p>正文</p><img src="https://example.com/legacy.png">',
    mediaPaths: ["/tmp/legacy.png"],
  });
  const { result } = renderHook(() => useArticleComposer("existing-article"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.mediaPaths).toEqual(["/tmp/legacy.png"]);
  act(() => result.current.setBody("<p>正文</p>"));
  expect(result.current.mediaPaths).toEqual([]);
  expect(result.current.firstImagePath).toBeNull();
});

it("saves the article before submitting distribution from the composer", async () => {
  vi.mocked(submitDistribution).mockResolvedValue(undefined);
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    result.current.setTitle("一阵风里的蒲公英");
    result.current.setBody(`<p>${"正文".repeat(200)}</p>`);
    result.current.setDraft(account.id, {
      ...emptyArticleDraft(),
      articleSettings: { coverMode: "none" },
    });
  });
  await act(async () => {
    await result.current.save(true);
  });
  expect(createContent).toHaveBeenCalledOnce();
  expect(submitDistribution).toHaveBeenCalledExactlyOnceWith("saved-article");
  expect(vi.mocked(createContent).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(submitDistribution).mock.invocationCallOrder[0],
  );
  expect(result.current.saving).toBe(false);
});

it("does not submit distribution when saving fails", async () => {
  vi.mocked(createContent).mockRejectedValueOnce(new Error("保存失败"));
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    result.current.setTitle("一阵风里的蒲公英");
    result.current.setBody(`<p>${"正文".repeat(200)}</p>`);
    result.current.setDraft(account.id, {
      ...emptyArticleDraft(),
      articleSettings: { coverMode: "none" },
    });
  });
  await act(async () => {
    await result.current.save(true);
  });
  expect(submitDistribution).not.toHaveBeenCalled();
  expect(result.current.error).toBeTruthy();
  expect(result.current.publishing).toBe(false);
});

it("keeps the saved article available when distribution cannot start", async () => {
  vi.mocked(submitDistribution).mockRejectedValueOnce(new Error("应用未就绪"));
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    result.current.setTitle("一阵风里的蒲公英");
    result.current.setBody(`<p>${"正文".repeat(200)}</p>`);
    result.current.setDraft(account.id, {
      ...emptyArticleDraft(),
      articleSettings: { coverMode: "none" },
    });
  });
  await act(async () => {
    await result.current.save(true);
  });
  expect(createContent).toHaveBeenCalledOnce();
  expect(submitDistribution).toHaveBeenCalledExactlyOnceWith("saved-article");
  expect(result.current.error).toBeTruthy();
  expect(result.current.saving).toBe(false);
});

it("ignores repeated publish clicks while submission is pending", async () => {
  let finish!: () => void;
  vi.mocked(submitDistribution).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    result.current.setTitle("一阵风里的蒲公英");
    result.current.setBody(`<p>${"正文".repeat(200)}</p>`);
    result.current.setDraft(account.id, {
      ...emptyArticleDraft(),
      articleSettings: { coverMode: "none" },
    });
  });
  let first!: Promise<unknown>;
  await act(async () => {
    first = result.current.save(true);
    await result.current.save(true);
  });
  expect(createContent).toHaveBeenCalledOnce();
  expect(submitDistribution).toHaveBeenCalledOnce();
  await act(async () => {
    finish();
    await first;
  });
});

it("requires a complete article before publishing but allows an incomplete draft", async () => {
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    result.current.setTitle("一阵风里的蒲公英");
  });
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

it("uses a global toast for missing fields without adding a page error", async () => {
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    expect((await result.current.save(true))?.id).toBe("title");
  });
  expect(toast.add).toHaveBeenCalledWith({
    type: "error",
    title: "标题未填写",
  });
  expect(result.current.error).toBe("");
  expect(submitDistribution).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.save(true);
  });
  expect(toast.add).toHaveBeenCalledTimes(2);
});

it("clears missing-cover highlighting when an account supplies its own required cover", async () => {
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.missingCommonCoverAspects).toEqual(["landscape"]);
  act(() => {
    const draft = emptyArticleDraft();
    result.current.setDraft(account.id, {
      ...draft,
      covers: {
        ...draft.covers,
        landscape: {
          ...draft.covers.landscape,
          saved: true,
          previewUrl: "blob:cover",
        },
      },
    });
  });
  expect(result.current.missingCommonCoverAspects).toEqual([]);
});

it("asks for an account instead of requiring an optional common cover before accounts are selected", async () => {
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    result.current.setSelected({});
    result.current.setTitle("一阵风里的蒲公英");
    result.current.setBody("<p>正文</p>");
  });
  expect(result.current.checks.find((check) => check.id === "cover")?.ok).toBe(
    true,
  );
  expect(result.current.missingCommonCoverAspects).toEqual([]);
  await act(async () => {
    expect((await result.current.save(true))?.id).toBe("accounts");
  });
  expect(toast.add).toHaveBeenCalledWith({
    type: "error",
    title: "分发账号尚未选择",
  });
  expect(submitDistribution).not.toHaveBeenCalled();
});

it("keeps required-cover validation and highlighting aligned after choosing an account", async () => {
  const { result } = renderHook(() => useArticleComposer(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    result.current.setTitle("一阵风里的蒲公英");
    result.current.setBody(`<p>${"正文".repeat(200)}</p>`);
  });
  expect(result.current.missingCommonCoverAspects).toEqual(["landscape"]);
  await act(async () => {
    expect((await result.current.save(true))?.id).toBe("cover");
  });
  expect(result.current.checks.find((check) => check.id === "cover")?.ok).toBe(
    false,
  );
  expect(submitDistribution).not.toHaveBeenCalled();
});
