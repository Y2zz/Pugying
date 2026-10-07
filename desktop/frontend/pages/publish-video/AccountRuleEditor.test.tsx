// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountOverrideForm } from "./AccountRuleEditor";
import { emptyDraft, localInputToIso, validateSchedule } from "./helpers";
import type { PlatformAccountItem } from "@/lib/api";

afterEach(cleanup);
function Form({
  platform = "douyin",
}: {
  platform?: "douyin" | "xiaohongshu";
}) {
  const [draft, setDraft] = useState(emptyDraft());
  return (
    <>
      <AccountOverrideForm
        account={
          {
            id: "a",
            displayName: "测试",
            platform,
          } as PlatformAccountItem
        }
        draft={draft}
        commonTitle="共同标题"
        commonBody=""
        commonCoverReady={false}
        commonCoverLandscapeReady={false}
        commonCoverPreviewUrl={null}
        commonCoverLandscapePreviewUrl={null}
        onDraftChange={setDraft}
        onEditCover={() => {}}
      />
      <output data-testid="schedule">{draft.scheduledLocal}</output>
      <output data-testid="visibility">{draft.visibility}</output>
    </>
  );
}
it("选择定时生成可保存的有效时间；切回立即发布清空时间", () => {
  render(<Form />);
  fireEvent.click(screen.getByRole("radio", { name: "定时发布" }));
  const value = screen.getByTestId("schedule").textContent!;
  expect(value).not.toBe("");
  expect(validateSchedule(localInputToIso(value))).toBeNull();
  expect(screen.getByLabelText("定时发布时间")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "立即发布" }));
  expect(screen.getByTestId("schedule").textContent).toBe("");
  expect(screen.queryByLabelText("定时发布时间")).toBeNull();
});
it("可见范围及话题具备可访问的标签", () => {
  render(<Form />);
  fireEvent.click(screen.getByRole("radio", { name: "仅自己可见" }));
  expect(screen.getByTestId("visibility").textContent).toBe("private");
  expect(screen.getByLabelText("话题")).toBeTruthy();
});
it("拒绝无效的发布时间", () => {
  expect(validateSchedule("invalid")).not.toBeNull();
});

it("自主声明随账号草稿保存和回显", async () => {
  const { draftToOverrides, overridesToDraft } = await import("./helpers");
  const draft = { ...emptyDraft(), authorDeclaration: "ai_generated" as const };
  expect(overridesToDraft(draftToOverrides(draft)).authorDeclaration).toBe(
    "ai_generated",
  );
});
it("简介加上话题超限时阻止发布，包含继承的通用简介", async () => {
  const { getAccountDraftIssues } = await import("./helpers");
  expect(
    getAccountDraftIssues(
      { ...emptyDraft(), tagsText: "美食" },
      "字".repeat(1000),
    ),
  ).toContain("简介与话题合计超过 1000 字");
});

it("视频选择使用核实后的格式、大小和时长限制", async () => {
  const { validateVideoFile, MAX_VIDEO_BYTES } = await import("./helpers");
  const file = { name: "test.mov", type: "", size: MAX_VIDEO_BYTES };
  expect(validateVideoFile(file, 3600)).toBeNull();
  expect(validateVideoFile({ ...file, size: MAX_VIDEO_BYTES + 1 })).toBe(
    "视频超过 32GB 上限",
  );
  expect(validateVideoFile(file, 36000.1)).toBe("视频时长不能超过 10 小时");
  expect(validateVideoFile({ ...file, name: "test.txt" })).toBe(
    "请选择视频文件",
  );
});

it("小红书视频隐藏不支持的好友、下载及独立话题选项，定时采用一小时窗口", () => {
  render(<Form platform="xiaohongshu" />);
  expect(screen.queryByRole("radio", { name: "好友可见" })).toBeNull();
  expect(screen.queryByText("保存权限")).toBeNull();
  expect(screen.queryByLabelText("话题")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "仅自己可见" }));
  expect(screen.getByTestId("visibility").textContent).toBe("private");
  fireEvent.click(screen.getByRole("radio", { name: "定时发布" }));
  const time = new Date(screen.getByTestId("schedule").textContent!).getTime();
  expect(time - Date.now()).toBeGreaterThanOrEqual(3600000);
  expect(time - Date.now()).toBeLessThan(7200000);
});

it("小红书继承的通用标题仍按20字验证，旧好友设置须修改", async () => {
  const { getAccountDraftIssues } = await import("./helpers");
  expect(
    getAccountDraftIssues(emptyDraft(), "", "xiaohongshu", "字".repeat(21)),
  ).toContain("标题超长");
  expect(
    getAccountDraftIssues(
      { ...emptyDraft(), visibility: "friends" },
      "",
      "xiaohongshu",
    ),
  ).toContain("请重新选择可见范围");
});

it("头条视频不显示好友或保存权限，保留私密设置", () => {
  render(<Form platform="toutiao" />);
  expect(screen.queryByRole("radio", { name: "好友可见" })).toBeNull();
  expect(screen.queryByText("保存权限")).toBeNull();
  expect(screen.queryByLabelText("话题")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "仅自己可见" }));
  expect(screen.getByTestId("visibility").textContent).toBe("private");
});

it("视频大小和时长按目标平台分别校验", async () => {
  const { validateVideoFile } = await import("./helpers");
  const file = { name: "test.mp4", type: "video/mp4", size: 18 * 1024 ** 3 };
  expect(validateVideoFile(file, 7200, "xiaohongshu")).toBeNull();
  expect(validateVideoFile(file, 7200, "toutiao")).toBeNull();
  expect(validateVideoFile(file, 7200, "douyin")).toBe("视频超过 16GB 上限");
  expect(validateVideoFile({ ...file, size: 1 }, 10801, "toutiao")).toBe(
    "视频时长不能超过 3 小时",
  );
  expect(validateVideoFile({ ...file, size: 1 }, 3601, "douyin")).toBe(
    "视频时长不能超过 1 小时",
  );
});

it("Bilibili video settings survive saving and draft reload", async () => {
  const { draftToOverrides, overridesToDraft } = await import("./helpers");
  const settings = {
    partitionId: 21,
    copyright: 2 as const,
    source: "original source",
    creationStatementId: 123,
  };
  const saved = draftToOverrides({
    ...emptyDraft(),
    bilibiliVideoSettings: settings,
  });
  expect(overridesToDraft(saved).bilibiliVideoSettings).toEqual(settings);
  expect(saved.bilibiliVideoSettings).not.toBe(settings);
});
