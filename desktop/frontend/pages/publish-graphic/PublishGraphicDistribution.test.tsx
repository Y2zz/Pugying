// @vitest-environment jsdom
import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PlatformAccountItem } from "@/lib/api";
import { emptyArticleDraft, emptyCoverPair } from "../publish-article/helpers";
import PublishGraphic from "../PublishGraphic";
import type { GraphicAccountEditor } from "./GraphicAccountEditor";

vi.mock("./GraphicAccountEditor", () => ({
  GraphicAccountEditor: ({
    accountId,
    getDraft,
    setDraft,
    onEditCover,
  }: ComponentProps<typeof GraphicAccountEditor>) =>
    accountId ? (
      <div>
        <span>图文设置 {accountId}</span>
        <button
          onClick={() =>
            setDraft(accountId, {
              ...getDraft(accountId),
              title: "图文账号标题",
            })
          }
        >
          修改图文标题
        </button>
        <button onClick={() => onEditCover(accountId, "portrait")}>
          编辑图文封面
        </button>
      </div>
    ) : null,
}));

const mocks = vi.hoisted(() => ({ composer: {} as Record<string, unknown> }));
vi.mock("./use-graphic-composer", () => ({
  useGraphicComposer: () => mocks.composer,
}));
vi.mock("./GraphicDocument", () => ({ GraphicDocument: () => null }));
vi.mock("./GraphicCoverCard", () => ({ GraphicCoverCard: () => null }));
vi.mock("./GraphicChecklistCard", () => ({ GraphicChecklistBar: () => null }));
vi.mock("../publish-video/AddAccountsDialog", () => ({
  AddAccountsDialog: () => null,
}));
vi.mock("@/components/EditCoverDialog", () => ({
  EditCoverDialog: () => null,
}));
vi.mock("./GraphicBulkEditDialog", () => ({
  GraphicBulkEditDialog: ({
    open,
    targets,
  }: {
    open: boolean;
    targets: { account: { id: string } }[];
  }) =>
    open ? (
      <div role="dialog">{targets.map((t) => t.account.id).join(",")}</div>
    ) : null,
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("发布图文直接使用公共名单，切换后写入图文账号并传递封面和批量目标", () => {
  const accounts = [
    { id: "a", displayName: "甲账号", platform: "douyin", status: "active" },
    { id: "b", displayName: "乙账号", platform: "douyin", status: "active" },
  ] as PlatformAccountItem[];
  const setDraft = vi.fn();
  const editCover = vi.fn();
  const remove = vi.fn();
  mocks.composer = {
    loading: false,
    saving: false,
    accounts,
    entries: accounts.map((account) => ({ account, platformLabel: "抖音" })),
    checks: [],
    covers: emptyCoverPair(),
    coverNeeds: [
      { aspect: "portrait", required: true, platformLabels: ["抖音"] },
    ],
    getDraft: emptyArticleDraft,
    setDraft,
    title: "通用图文标题",
    bodyLimits: { min: 0, max: 1000 },
    accountIssues: new Map([["b", ["话题过多"]]]),
    removeAccounts: remove,
    openCoverEditor: editCover,
    coverEditor: { open: false },
    selected: { a: true, b: true },
    catalog: [],
  };
  render(
    <MemoryRouter>
      <PublishGraphic />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "搜索账号" }), {
    target: { value: "乙" },
  });
  fireEvent.click(screen.getByRole("button", { name: /乙账号.*话题过多/ }));
  expect(screen.getByText("图文设置 b")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "修改图文标题" }));
  expect(setDraft).toHaveBeenCalledWith(
    "b",
    expect.objectContaining({ title: "图文账号标题" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "编辑图文封面" }));
  expect(editCover).toHaveBeenCalledWith("portrait", { accountId: "b" });
  fireEvent.click(screen.getByRole("checkbox", { name: "全选" }));
  fireEvent.click(screen.getByRole("button", { name: "批量设置" }));
  expect(screen.getByRole("dialog").textContent).toBe("b");
  fireEvent.click(screen.getByRole("button", { name: "移除", exact: true }));
  expect(remove).toHaveBeenCalledWith(["b"]);
});
