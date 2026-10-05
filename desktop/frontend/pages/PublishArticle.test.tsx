// @vitest-environment jsdom
import type { RefObject } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PublishArticle from "./PublishArticle";
import type { ArticleCheck } from "./publish-article/use-article-composer";

const mocks = vi.hoisted(() => ({
  composer: {} as Record<string, unknown>,
  scrollTo: vi.fn(),
}));

vi.mock("./publish-article/use-article-composer", () => ({
  useArticleComposer: () => mocks.composer,
}));
vi.mock("./publish-article/scroll-to-article-field", () => ({
  scrollToArticleField: mocks.scrollTo,
}));
vi.mock("@/components/EditCoverDialog", () => ({
  EditCoverDialog: () => null,
}));
vi.mock("./publish-video/AddAccountsDialog", () => ({
  AddAccountsDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">添加账号</div> : null,
}));
vi.mock("./publish-article/ArticleBulkEditDialog", () => ({
  ArticleBulkEditDialog: () => null,
}));
vi.mock("./publish-article/ArticlePageHeader", () => ({
  ArticlePageHeader: ({
    checks,
    onFix,
  }: {
    checks: ArticleCheck[];
    onFix: (check: ArticleCheck) => void;
  }) => (
    <div>
      {checks.map((check) => (
        <button key={check.id} onClick={() => onFix(check)}>
          {check.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("./publish-article/ArticleDocument", () => ({
  ArticleDocument: ({
    titleRef,
    editorRef,
    imageWarningRef,
    pathWarning,
  }: {
    titleRef: RefObject<HTMLInputElement | null>;
    editorRef: RefObject<HTMLDivElement | null>;
    imageWarningRef: RefObject<HTMLDivElement | null>;
    pathWarning: unknown;
  }) => (
    <div>
      <input ref={titleRef} aria-label="文章标题" />
      {pathWarning ? (
        <div ref={imageWarningRef} role="alert">
          有图片不可用
        </div>
      ) : null}
      <div data-slot="field" data-testid="body-field">
        <div
          ref={editorRef}
          role="textbox"
          aria-label="文章正文"
          tabIndex={0}
        />
      </div>
    </div>
  ),
}));
vi.mock("./publish-article/ArticleCoverCard", () => ({
  ArticleCoverCard: ({
    sectionRef,
  }: {
    sectionRef: RefObject<HTMLElement | null>;
  }) => (
    <section ref={sectionRef} data-testid="covers">
      通用封面
    </section>
  ),
}));
vi.mock("./publish-article/ArticleDistributionPanel", () => ({
  ArticleDistributionPanel: ({
    focusedAccountId,
    accountsEmpty,
  }: {
    focusedAccountId: string | null;
    accountsEmpty: boolean;
  }) => (
    <div>
      <h2>分发账号</h2>
      {accountsEmpty ? <a href="/platform-accounts">去绑定账号</a> : null}
      {focusedAccountId ? (
        <div
          data-slot="article-account-editor"
          data-account-id={focusedAccountId}
        >
          <div
            data-slot="field"
            data-invalid="true"
            data-testid="account-field"
          >
            <input aria-label="账号标题" />
          </div>
        </div>
      ) : null}
    </div>
  ),
}));

const checks: ArticleCheck[] = [
  { id: "title", label: "标题", ok: false, detail: "未填写" },
  { id: "body", label: "正文", ok: false, detail: "未填写" },
  { id: "images", label: "配图", ok: false, detail: "有图片不可用" },
  { id: "cover", label: "封面", ok: false, detail: "未设置" },
  { id: "accounts", label: "分发账号", ok: false, detail: "尚未选择" },
  {
    id: "accountConfig",
    label: "账号设置",
    ok: false,
    detail: "需调整",
    accountId: "account-2",
  },
];

beforeEach(() => {
  mocks.scrollTo.mockReset();
  mocks.composer = {
    loading: false,
    saving: false,
    entries: [],
    accounts: [{ id: "account-1" }],
    checks,
    covers: {},
    getDraft: vi.fn(),
    bodyLimits: { min: 0, max: 1000 },
    coverEditor: { open: false },
    pathWarning: { tone: "error", text: "有图片不可用" },
  };
});

afterEach(() => {
  cleanup();
});

function setup() {
  render(
    <MemoryRouter>
      <main>
        <PublishArticle />
      </main>
    </MemoryRouter>,
  );
}

it("offers continuing or starting a new article while a local draft is awaiting a decision", () => {
  mocks.composer.pendingRecovery = { data: { title: "本地草稿" } };
  mocks.composer.loading = true;
  mocks.composer.continueRecovery = vi.fn();
  mocks.composer.startNew = vi.fn();
  setup();
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  expect(mocks.composer.continueRecovery).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "新建文章" }));
  expect(mocks.composer.startNew).toHaveBeenCalledTimes(1);
});

it("focuses the title without automatic scrolling", () => {
  setup();
  const title = screen.getByRole("textbox", { name: "文章标题" });
  const focus = vi.spyOn(title, "focus");
  fireEvent.click(screen.getByRole("button", { name: "标题" }));
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(document.activeElement).toBe(title);
  expect(mocks.scrollTo).toHaveBeenCalledWith(title);
});

it("locates the body field including its toolbar", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "正文" }));
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "文章正文" }),
  );
  expect(mocks.scrollTo).toHaveBeenCalledWith(
    screen.getByTestId("body-field"),
    "start",
  );
});

it("locates the image warning while focusing the editor", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "配图" }));
  expect(mocks.scrollTo).toHaveBeenCalledWith(
    screen.getByRole("alert"),
    "start",
  );
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "文章正文" }),
  );
});

it("falls back to the editor when an image warning has cleared", () => {
  mocks.composer.pathWarning = null;
  setup();
  fireEvent.click(screen.getByRole("button", { name: "配图" }));
  expect(mocks.scrollTo).toHaveBeenCalledWith(
    screen.getByTestId("body-field"),
    "start",
  );
});

it("locates the common covers", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "封面" }));
  expect(mocks.scrollTo).toHaveBeenCalledWith(screen.getByTestId("covers"));
});

it("opens the account picker when bound accounts have not been selected", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "分发账号" }));
  expect(screen.getByRole("dialog").textContent).toBe("添加账号");
  expect(mocks.scrollTo.mock.calls[0][0].textContent).toContain("分发账号");
  expect(mocks.scrollTo.mock.calls[0][1]).toBe("start");
});

it("focuses the binding action when no accounts exist", () => {
  mocks.composer.accounts = [];
  setup();
  fireEvent.click(screen.getByRole("button", { name: "分发账号" }));
  expect(document.activeElement).toBe(
    screen.getByRole("link", { name: "去绑定账号" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("renders the account with issues before locating and focusing its invalid field", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "账号设置" }));
  const field = screen.getByTestId("account-field");
  expect(field.parentElement?.dataset.accountId).toBe("account-2");
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "账号标题" }),
  );
  expect(mocks.scrollTo).toHaveBeenCalledWith(field, "start");
});
