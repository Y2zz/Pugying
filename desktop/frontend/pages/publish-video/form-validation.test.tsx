// @vitest-environment jsdom
import { createRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Field } from "@/components/ui/field";
import type { PlatformAccountItem } from "@/lib/api";
import { CharCountInput, CharCountTextarea } from "./CharCountFields";
import { AccountOverrideForm, ContentInfoForm } from "./AccountRuleEditor";
import { emptyDraft } from "./helpers";
import {
  ArticleTagsField,
  ArticleTitleOverrideField,
} from "../publish-article/account-forms/shared-fields";
import { emptyArticleDraft, emptyCoverPair } from "../publish-article/helpers";
import { DouyinGraphicAccountForm } from "../publish-graphic/account-forms/DouyinGraphicAccountForm";

afterEach(cleanup);

it("超限提示关联实际控件，修正后清除，并保留原有说明关联", () => {
  const { rerender } = render(
    <Field>
      <CharCountInput
        aria-label="标题"
        aria-describedby="hint"
        value="超出上限"
        max={3}
      />
    </Field>,
  );
  const input = screen.getByRole("textbox", { name: "标题" });
  const error = screen.getByText("最多 3 字");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe(`hint ${error.id}`);
  rerender(
    <Field>
      <CharCountInput
        aria-label="标题"
        aria-describedby="hint"
        value="正常"
        max={3}
      />
    </Field>,
  );
  expect(input.hasAttribute("aria-invalid")).toBe(false);
  expect(input.getAttribute("aria-describedby")).toBe("hint");
  expect(screen.queryByText("最多 3 字")).toBeNull();
});

it("多行字段超限不会被调用方的有效状态覆盖", () => {
  render(
    <Field>
      <CharCountTextarea
        aria-label="摘要"
        aria-invalid={false}
        value="摘要超限"
        max={3}
      />
    </Field>,
  );
  expect(screen.getByLabelText("摘要").getAttribute("aria-invalid")).toBe(
    "true",
  );
  expect(screen.getByText("最多 3 字")).toBeTruthy();
});

it("必填标题在失焦或保存尝试后提示，输入有效内容后消失", () => {
  function Form({ attempted = false }: { attempted?: boolean }) {
    const [title, setTitle] = useState("");
    return (
      <ContentInfoForm
        title={title}
        setTitle={setTitle}
        body=""
        setBody={() => {}}
        titleInputRef={createRef()}
        disabled={false}
        validationAttempted={attempted}
      />
    );
  }
  const { rerender } = render(<Form />);
  expect(screen.queryByText("请填写标题")).toBeNull();
  fireEvent.blur(screen.getByLabelText("标题"));
  expect(screen.getByText("请填写标题")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("标题"), {
    target: { value: "有效标题" },
  });
  expect(screen.queryByText("请填写标题")).toBeNull();
  rerender(<Form key="new" attempted />);
  expect(screen.getByText("请填写标题")).toBeTruthy();
});

it("删除多余话题后立即解除错误", () => {
  function Form() {
    const [tags, setTags] = useState("美食 旅行");
    return <ArticleTagsField tagsText={tags} maxCount={1} onChange={setTags} />;
  }
  render(<Form />);
  const input = screen.getByLabelText("话题");
  const error = screen.getByText("最多 1 个话题，请删除 1 个");
  expect(input.getAttribute("aria-describedby")).toBe(error.id);
  fireEvent.click(screen.getByRole("button", { name: "移除 旅行" }));
  expect(screen.queryByText("最多 1 个话题，请删除 1 个")).toBeNull();
  expect(input.hasAttribute("aria-invalid")).toBe(false);
});

it("账号标题继承通用值时也检查平台最短和最长限制", () => {
  const { rerender } = render(
    <ArticleTitleOverrideField
      accountId="a"
      value=""
      commonTitle="字"
      min={2}
      max={30}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText("该平台标题至少 2 字")).toBeTruthy();
  rerender(
    <ArticleTitleOverrideField
      accountId="a"
      value=""
      commonTitle={"字".repeat(31)}
      min={2}
      max={30}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText("该平台标题最多 30 字")).toBeTruthy();
});

it("账号继承简介加上话题超限时显示可定位的字段错误", () => {
  const props = {
    account: {
      id: "a",
      displayName: "测试",
      platform: "douyin",
    } as PlatformAccountItem,
    draft: {
      ...emptyDraft(),
      tagsText: "美食",
      topicRefs: [{ id: "0", name: "美食" }],
    },
    commonTitle: "标题",
    commonBody: "字".repeat(1000),
    commonCoverReady: false,
    commonCoverLandscapeReady: false,
    commonCoverPreviewUrl: null,
    commonCoverLandscapePreviewUrl: null,
    onDraftChange: () => {},
    onEditCover: () => {},
  };
  const { rerender } = render(<AccountOverrideForm {...props} />);
  const body = screen.getByLabelText("作品简介");
  const error = screen.getByText("简介与话题合计最多 1000 字");
  expect(body.getAttribute("aria-describedby")).toBe(error.id);
  expect(
    body.closest('[data-slot="field"]')?.getAttribute("data-invalid"),
  ).toBe("true");
  rerender(<AccountOverrideForm {...props} commonBody="简短简介" />);
  expect(screen.queryByText("简介与话题合计最多 1000 字")).toBeNull();
});

it("图文的文案与话题合计超限时，关联话题输入并随文案修改清除", () => {
  const props = {
    account: { id: "g", platform: "douyin" } as PlatformAccountItem,
    draft: {
      ...emptyArticleDraft(),
      tagsText: "美食",
      topicRefs: [{ id: "0", name: "美食" }],
    },
    commonTitle: "标题",
    commonBody: "字".repeat(1000),
    commonCovers: emptyCoverPair(),
    onDraftChange: () => {},
    onEditCover: () => {},
  };
  const { rerender } = render(<DouyinGraphicAccountForm {...props} />);
  const error = screen.getByText(
    "文案与话题合计最多 1000 字，请缩短文案或减少话题",
  );
  expect(screen.getByLabelText("话题").getAttribute("aria-describedby")).toBe(
    error.id,
  );
  rerender(<DouyinGraphicAccountForm {...props} commonBody="简短文案" />);
  expect(
    screen.queryByText("文案与话题合计最多 1000 字，请缩短文案或减少话题"),
  ).toBeNull();
});

it("草稿中的无效发布时间关联时间选择器的错误状态", () => {
  render(
    <AccountOverrideForm
      account={{ id: "a", platform: "douyin" } as PlatformAccountItem}
      draft={{ ...emptyDraft(), scheduledLocal: "invalid" }}
      commonTitle="标题"
      commonBody=""
      commonCoverReady={false}
      commonCoverLandscapeReady={false}
      commonCoverPreviewUrl={null}
      commonCoverLandscapePreviewUrl={null}
      onDraftChange={() => {}}
      onEditCover={() => {}}
    />,
  );
  const picker = screen.getByLabelText("定时发布时间");
  expect(picker.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(picker.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBeTruthy();
});
