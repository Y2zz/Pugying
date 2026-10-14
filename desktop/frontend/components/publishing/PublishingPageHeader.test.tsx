// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PublishingPageHeader } from "./PublishingPageHeader";
import { PublishingChecklistBar } from "./PublishingChecklistBar";
const checks = [{ id: "title", label: "标题", ok: false, detail: "请填写" }];
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
it("展开时提供保存与检查定位，滚动后收紧并保留保存入口", () => {
  const fix = vi.fn();
  const save = vi.fn();
  const { container } = render(
    <main>
      <PublishingPageHeader
        title="发布图文"
        description="先选图片"
        checks={checks}
        loading={false}
        disabled={false}
        saveLabel="保存草稿"
        onSave={save}
        onFix={fix}
        renderChecks={(onFix) => (
          <PublishingChecklistBar checks={checks} onFix={onFix} />
        )}
      />
    </main>,
  );
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(save).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /标题.*请填写/ }));
  expect(fix).toHaveBeenCalledWith(checks[0]);
  const main = container.querySelector("main")!;
  main.scrollTop = 120;
  fireEvent.scroll(main);
  expect(container.querySelector('[data-compact="true"]')).toBeTruthy();
  expect(screen.queryByText("先选图片")).toBeNull();
  expect(screen.getByRole("button", { name: /还差 1 项/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "保存草稿" })).toBeTruthy();
});
it("禁用时锁定保存，额外发布操作保留", () => {
  render(
    <PublishingPageHeader
      title="发布视频"
      description=""
      checks={[]}
      loading
      disabled
      saveLabel="保存草稿"
      onSave={vi.fn()}
      onFix={vi.fn()}
      renderChecks={() => null}
      actions={<button disabled>发布</button>}
    />,
  );
  expect(
    screen.getByRole("button", { name: "保存草稿" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByRole("button", { name: "发布" })).toBeTruthy();
});

it("自动保存失败的状态和重试入口在页头收紧后仍可使用", () => {
  const retry = vi.fn();
  const { container } = render(
    <main>
      <PublishingPageHeader
        title="发布文章"
        description=""
        checks={checks}
        loading={false}
        disabled={false}
        saveLabel="保存草稿"
        onSave={vi.fn()}
        onFix={vi.fn()}
        autoSaveStatus="自动保存失败"
        autoSaveFailed
        onRetryAutoSave={retry}
        renderChecks={(onFix) => (
          <PublishingChecklistBar checks={checks} onFix={onFix} />
        )}
      />
    </main>,
  );
  expect(screen.getByRole("status").textContent).toBe("自动保存失败");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(retry).toHaveBeenCalledTimes(1);
  const main = container.querySelector("main")!;
  main.scrollTop = 120;
  fireEvent.scroll(main);
  expect(screen.getByRole("status").textContent).toBe("自动保存失败");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(retry).toHaveBeenCalledTimes(2);
});
