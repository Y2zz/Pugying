// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PlatformAccountItem } from "@/lib/api";
import { emptyDraft } from "./helpers";
import { PublishVideoFormPanel } from "./PublishVideoFormPanel";

vi.mock("./AccountRuleEditor", () => ({ ContentInfoForm: () => null }));
vi.mock("./CoverEditorSection", () => ({ CoverEditorSection: () => null }));
vi.mock("./AddAccountsDialog", () => ({
  AddAccountsDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">添加视频账号</div> : null,
}));
vi.mock("./DistributionAccountEditor", () => ({
  DistributionAccountEditor: ({
    account,
    onDraftChange,
  }: {
    account: PlatformAccountItem;
    onDraftChange: (draft: ReturnType<typeof emptyDraft>) => void;
  }) => (
    <div>
      <span>配置 {account.displayName}</span>
      <button
        onClick={() => onDraftChange({ ...emptyDraft(), title: "独立标题" })}
      >
        修改账号标题
      </button>
    </div>
  ),
}));
afterEach(cleanup);

it("视频接入共用名单，切换后写入对应账号，批量移除后显示空状态", () => {
  const accounts = [
    { id: "a", platform: "douyin", displayName: "甲账号", status: "active" },
    { id: "b", platform: "douyin", displayName: "乙账号", status: "active" },
  ] as PlatformAccountItem[];
  const change = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState({ a: true, b: true } as Record<
      string,
      boolean
    >);
    const [focused, setFocused] = useState<string | null>("a");
    return (
      <PublishVideoFormPanel
        catalog={[]}
        accounts={accounts}
        grouped={[{ platform: "douyin", displayName: "抖音", accounts }]}
        selected={selected}
        setSelected={setSelected}
        expandedAccountId={focused}
        setExpandedAccountId={setFocused}
        setDraftForAccount={change}
        getDraft={emptyDraft}
        loading={false}
        accountsEmpty={false}
        accountsSectionRef={{ current: null }}
        coverSectionRef={{ current: null }}
        title="通用标题"
        setTitle={vi.fn()}
        body=""
        setBody={vi.fn()}
        coverReady={false}
        coverLandscapeReady={false}
        coverPreviewUrl={null}
        coverLandscapePreviewUrl={null}
        coverHint=""
        onEditCover={vi.fn()}
        onEditAccountCover={vi.fn()}
        titleInputRef={{ current: null }}
        disabled={false}
      />
    );
  }
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
  expect(screen.getByRole("textbox", { name: "搜索账号" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /乙账号.*就绪/ }));
  expect(screen.getByText("配置 乙账号")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "修改账号标题" }));
  expect(change).toHaveBeenCalledWith(
    "b",
    expect.objectContaining({ title: "独立标题" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "全选" }));
  fireEvent.click(screen.getByRole("button", { name: "移除", exact: true }));
  expect(screen.getByText("选择要分发的账号")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "添加账号" }));
  expect(screen.getByRole("dialog").textContent).toBe("添加视频账号");
});
