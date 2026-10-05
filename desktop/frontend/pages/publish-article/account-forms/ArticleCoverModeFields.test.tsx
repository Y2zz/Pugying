// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { PlatformAccountItem } from "@/lib/api";
import {
  emptyArticleDraft,
  emptyCoverPair,
  missingRequiredCovers,
  articleDraftToOverrides,
} from "../helpers";
import {
  BilibiliArticleCoverField,
  ToutiaoArticleCoverField,
} from "./ArticleCoverModeFields";

afterEach(cleanup);
const edit = vi.fn();
function Form({ platform }: { platform: "toutiao" | "bilibili" }) {
  const [draft, setDraft] = useState(emptyArticleDraft);
  const Field =
    platform === "toutiao"
      ? ToutiaoArticleCoverField
      : BilibiliArticleCoverField;
  return (
    <Field
      account={{ id: "account", platform } as PlatformAccountItem}
      draft={draft}
      commonCovers={emptyCoverPair()}
      onEditCover={edit}
      patch={(partial) => {
        setDraft((prev) => ({ ...prev, ...partial }));
      }}
    />
  );
}
it("Toutiao controls three independent cover slots and hides them for no cover", async () => {
  render(<Form platform="toutiao" />);
  const user = userEvent.setup();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  await user.click(screen.getByRole("radio", { name: "三图" }));
  expect(screen.getAllByRole("button")).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "设置第2张封面" }));
  expect(edit).toHaveBeenLastCalledWith("landscape", 0);
  await user.click(screen.getByRole("button", { name: "设置第3张封面" }));
  expect(edit).toHaveBeenLastCalledWith("landscape", 1);
  await user.click(screen.getByRole("radio", { name: "无封面" }));
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
it("Bilibili default cover is generated from text and custom covers use an explicit mode", async () => {
  render(<Form platform="bilibili" />);
  const user = userEvent.setup();
  expect(screen.getByText("封面由正文开头文字生成")).toBeTruthy();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  await user.click(screen.getByRole("radio", { name: "自定义封面" }));
  expect(screen.getByRole("button", { name: "设置横版 4:3封面" })).toBeTruthy();
  expect(screen.getByText("JPG、PNG，建议不低于 600 × 336 像素")).toBeTruthy();
  await user.click(screen.getByRole("radio", { name: "自动生成" }));
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
it("persists explicit modes and checks complete galleries and enabled custom covers", () => {
  const draft = emptyArticleDraft();
  const common = emptyCoverPair();
  draft.articleSettings = { coverMode: "none" };
  expect(missingRequiredCovers(draft, common, "toutiao")).toEqual([]);
  expect(
    articleDraftToOverrides(draft, "toutiao").articleSettings?.coverMode,
  ).toBe("none");
  draft.articleSettings = { coverMode: "triple" };
  common.landscape.saved = true;
  expect(missingRequiredCovers(draft, common, "toutiao")).toEqual([
    "landscape",
  ]);
  draft.extraCovers!.forEach((slot) => {
    slot.saved = true;
  });
  expect(missingRequiredCovers(draft, common, "toutiao")).toEqual([]);
  draft.articleSettings = { customCover: true };
  expect(missingRequiredCovers(draft, emptyCoverPair(), "bilibili")).toEqual([
    "landscape",
  ]);
  expect(missingRequiredCovers(draft, common, "bilibili")).toEqual([]);
  draft.articleSettings.customCover = false;
  expect(
    articleDraftToOverrides(draft, "bilibili").articleSettings?.customCover,
  ).toBe(false);
});
