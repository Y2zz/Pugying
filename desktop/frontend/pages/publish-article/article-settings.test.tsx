// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ArticleAccountSettings } from "@shared/article-settings";
import { ArticlePlatformSettingsFields } from "./account-forms/ArticlePlatformSettingsFields";
import {
  ArticleScheduleField,
  ArticleTagsField,
} from "./account-forms/shared-fields";
import {
  articleDraftHasCustomizations,
  articleDraftToOverrides,
  draftFromTarget,
  emptyArticleDraft,
  getArticleAccountDraftIssues,
  missingRequiredCovers,
  emptyCoverPair,
} from "./helpers";
import {
  getArticlePlatformFields,
  articleCoverAspects,
  intersectBulkCapabilities,
  intersectArticleBodyLimits,
} from "./article-platform-fields";

afterEach(cleanup);

it("restores article settings and only sends fields belonging to the account platform", () => {
  const draft = draftFromTarget(
    {
      articleSettings: {
        summary: "摘要",
        comments: "closed",
        original: true,
        declarations: ["ai"],
        allowReward: false,
      },
    },
    { tags: [], visibility: "public", scheduledAt: null },
  );
  expect(articleDraftToOverrides(draft, "douyin").articleSettings).toEqual({
    summary: "摘要",
  });
  expect(articleDraftToOverrides(draft, "bilibili").articleSettings).toEqual({
    comments: "closed",
    original: true,
    customCover: false,
  });
  expect(
    articleDraftToOverrides(draft, "toutiao").articleSettings,
  ).toMatchObject({
    declarations: ["ai"],
    allowReward: false,
    exclusive: false,
  });
  expect(
    articleDraftToOverrides(emptyArticleDraft(), "bilibili").articleSettings
      ?.original,
  ).toBe(false);
});

it("uses verified body, schedule, visibility and cover capabilities", () => {
  expect(intersectArticleBodyLimits(["douyin", "bilibili"]).max).toBe(20000);
  expect(getArticlePlatformFields("bilibili").bodyPlainMax).toBe(100000);
  expect(getArticlePlatformFields("bilibili").schedule?.maxDays).toBe(7);
  expect(intersectBulkCapabilities(["douyin", "bilibili"]).visibility).toEqual([
    "public",
    "private",
  ]);
  expect(intersectBulkCapabilities(["douyin", "toutiao"]).tags).toBeNull();
  expect(getArticlePlatformFields("bilibili").partition.enabled).toBe(false);
  expect(
    missingRequiredCovers(emptyArticleDraft(), emptyCoverPair(), "bilibili"),
  ).toEqual([]);
});

it("validates summary by Unicode characters", () => {
  const draft = {
    ...emptyArticleDraft(),
    articleSettings: { summary: "😀".repeat(30) },
  };
  expect(getArticleAccountDraftIssues(draft, "douyin", "标题")).toEqual([]);
  draft.articleSettings.summary += "字";
  expect(getArticleAccountDraftIssues(draft, "douyin", "标题")).toContain(
    "摘要最多 30 字",
  );
});

it("requires Douyin portrait cover and accepts either common or account-specific portrait cover", () => {
  const draft = emptyArticleDraft();
  const common = emptyCoverPair();
  expect(articleCoverAspects("douyin")).toEqual(["portrait"]);
  common.landscape.saved = true;
  expect(missingRequiredCovers(draft, common, "douyin")).toEqual(["portrait"]);
  common.portrait.saved = true;
  expect(missingRequiredCovers(draft, common, "douyin")).toEqual([]);
  common.portrait.saved = false;
  draft.covers.portrait.blob = new Blob(["portrait"], { type: "image/jpeg" });
  expect(missingRequiredCovers(draft, common, "douyin")).toEqual([]);
  expect(articleCoverAspects("toutiao")).toEqual(["landscape"]);
  expect(missingRequiredCovers(draft, emptyCoverPair(), "toutiao")).toEqual([
    "landscape",
  ]);
});

it("评论复选框联动，关闭评论后禁用并清除精选状态", async () => {
  const change = vi.fn();
  function Form() {
    const [value, setValue] = useState<ArticleAccountSettings>();
    return (
      <ArticlePlatformSettingsFields
        accountId="bili"
        platform="bilibili"
        value={value}
        onChange={(next) => {
          setValue(next);
          change(next);
        }}
      />
    );
  }
  render(<Form />);
  const user = userEvent.setup();
  const original = screen.getByRole("checkbox", {
    name: "声明原创，未经授权禁止转载",
  });
  expect(
    screen
      .getByRole("checkbox", { name: "允许评论" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByRole("checkbox", { name: "精选评论" }));
  expect(change).toHaveBeenLastCalledWith({ comments: "selected" });
  expect(
    screen
      .getByRole("checkbox", { name: "允许评论" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(original);
  await user.click(screen.getByRole("checkbox", { name: "允许评论" }));
  expect(change).toHaveBeenLastCalledWith({
    comments: "closed",
    original: true,
  });
  const selected = screen.getByRole("checkbox", { name: "精选评论" });
  expect(selected.getAttribute("aria-checked")).toBe("false");
  expect(selected.getAttribute("aria-disabled")).toBe("true");
  await user.click(selected);
  expect(change).toHaveBeenLastCalledWith({
    comments: "closed",
    original: true,
  });
  await user.click(screen.getByRole("checkbox", { name: "允许评论" }));
  expect(change).toHaveBeenLastCalledWith({ comments: "open", original: true });
  expect(
    screen
      .getByRole("checkbox", { name: "精选评论" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  await user.click(screen.getByRole("checkbox", { name: "精选评论" }));
  await user.click(screen.getByRole("checkbox", { name: "精选评论" }));
  expect(change).toHaveBeenLastCalledWith({ comments: "open", original: true });
});

it("choosing scheduled publication produces a valid time and immediate publication clears it", async () => {
  const change = vi.fn();
  const { rerender } = render(
    <ArticleScheduleField
      accountId="schedule"
      scheduledLocal=""
      minHours={2}
      maxDays={7}
      onChange={change}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "定时发布" }));
  const value = change.mock.calls[0][0];
  expect(new Date(value).getTime()).toBeGreaterThanOrEqual(
    Date.now() + 2 * 3600000,
  );
  rerender(
    <ArticleScheduleField
      accountId="schedule"
      scheduledLocal={value}
      minHours={2}
      maxDays={7}
      onChange={change}
    />,
  );
  await user.click(screen.getByRole("button", { name: "立即发布" }));
  expect(change).toHaveBeenLastCalledWith("");
});

it("does not mark persisted platform defaults as customizations", () => {
  const draft = {
    ...emptyArticleDraft(),
    articleSettings: articleDraftToOverrides(emptyArticleDraft(), "toutiao")
      .articleSettings,
  };
  expect(articleDraftHasCustomizations(draft)).toBe(false);
  draft.articleSettings = { allowReward: false };
  expect(articleDraftHasCustomizations(draft)).toBe(true);
});

it("Toutiao declarations are independent checkboxes and advertisements are mutually exclusive radios", async () => {
  function Form() {
    const [value, setValue] = useState<ArticleAccountSettings>();
    return (
      <ArticlePlatformSettingsFields
        accountId="toutiao"
        platform="toutiao"
        value={value}
        onChange={setValue}
      />
    );
  }
  render(<Form />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox", { name: "引用AI" }));
  await user.click(screen.getByRole("checkbox", { name: "取材网络" }));
  await user.click(screen.getByRole("checkbox", { name: "引用AI" }));
  expect(
    screen
      .getByRole("checkbox", { name: "取材网络" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("checkbox", { name: "引用AI" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  await user.click(screen.getByRole("radio", { name: "投放广告赚收益" }));
  expect(
    screen
      .getByRole("radio", { name: "投放广告赚收益" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("radio", { name: "不投放广告" })
      .getAttribute("aria-checked"),
  ).toBe("false");
});

it.each(["radio", "switch"] as const)(
  "platform %s schedule control initializes valid time and clears it when disabled",
  async (control) => {
    function Form() {
      const [value, setValue] = useState("");
      return (
        <ArticleScheduleField
          control={control}
          accountId="native-time"
          scheduledLocal={value}
          minHours={2}
          maxDays={7}
          onChange={setValue}
        />
      );
    }
    render(<Form />);
    const user = userEvent.setup();
    await user.click(screen.getByRole(control, { name: "定时发布" }));
    expect(
      screen
        .getByRole(control, { name: "定时发布" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    if (control === "switch") {
      await user.click(screen.getByRole("switch", { name: "定时发布" }));
    } else {
      await user.click(screen.getByRole("radio", { name: "立即发布" }));
    }
    expect(
      screen
        .getByRole(control, { name: "定时发布" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  },
);

it("话题输入框能通过标签找到，多表单同时渲染时标签关联各自输入框", async () => {
  render(
    <>
      <ArticleTagsField tagsText="" maxCount={5} onChange={vi.fn()} />
      <ArticleTagsField tagsText="" maxCount={5} onChange={vi.fn()} />
    </>,
  );
  const inputs = screen.getAllByRole("textbox", { name: "话题" });
  expect(inputs).toHaveLength(2);
  expect(inputs[0].id).not.toBe(inputs[1].id);
  const user = userEvent.setup();
  await user.click(screen.getAllByText("话题", { selector: "label" })[1]);
  expect(document.activeElement).toBe(inputs[1]);
});
