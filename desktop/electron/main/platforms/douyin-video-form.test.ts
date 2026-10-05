// @vitest-environment jsdom
import type { WebContents } from "electron";
import {
  applyDouyinVideoSettings,
  dismissDouyinVideoCoverRecommendation,
  douyinVideoScheduleText,
  fillDouyinVideoMetadata,
  openDouyinVideoCover,
  verifyDouyinVideoCover,
} from "./douyin-video-form";

function form(acceptTopics = true) {
  document.body.innerHTML = `<input placeholder="填写作品标题，为作品获得更多流量" />
    <div contenteditable="true" data-slate-editor="true">旧简介</div>
    <div><label><input type="checkbox" checked />公开</label><label><input type="checkbox" />好友可见</label><label><input type="checkbox" />仅自己可见</label></div>
    <div><label><input type="checkbox" checked />允许</label><label><input type="checkbox" />不允许</label></div>
    <span>请选择自主声明</span>
    <div><label><input type="checkbox" checked />立即发布</label><label><input type="checkbox" />定时发布</label></div>
    <input placeholder="日期和时间" />`;
  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )) {
    input.addEventListener("change", () => {
      for (const sibling of input.parentElement!.parentElement!.querySelectorAll<HTMLInputElement>(
        "input",
      )) {
        sibling.checked = sibling === input;
      }
    });
  }
  let hashNode: Text | null = null;
  return {
    executeJavaScript: vi.fn(async (script: string) => window.eval(script)),
    insertText: vi.fn(async (text: string) => {
      const range = window.getSelection()!.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      if (text === "#") {
        hashNode = node;
      } else if (hashNode?.parentElement && !text.includes("#")) {
        const hash = hashNode;
        const candidate = document.createElement("div");
        candidate.className = "tag-hash-test";
        const name = document.createElement("span");
        name.className = "tag-hash-view-name-test";
        name.textContent = text;
        candidate.append(name);
        candidate.getClientRects = () =>
          [new DOMRect()] as unknown as DOMRectList;
        candidate.addEventListener("click", () => {
          if (!acceptTopics) {
            candidate.remove();
            return;
          }
          const entity = document.createElement("span");
          entity.setAttribute("data-mention", "#");
          entity.textContent = "#" + text;
          hash.replaceWith(entity);
          node.remove();
          candidate.remove();
        });
        document.body.append(candidate);
        hashNode = null;
      }
    }),
    sendInputEvent: vi.fn(),
  } as unknown as WebContents;
}
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});
it("填写实际标题框和 Slate 简介，话题只追加一次", async () => {
  const wc = form();
  expect(
    await fillDouyinVideoMetadata(wc, {
      title: "核实😀",
      body: "简介 #美食",
      tags: ["美食", "旅行"],
    }),
  ).toBe(true);
  expect(document.querySelector("input")!.value).toBe("核实😀");
  expect(document.querySelector("[contenteditable]")!.textContent).toBe(
    "简介 #美食\n#旅行",
  );
});
it("不依赖正文编辑器的 DOM 顺序", async () => {
  const wc = form();
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div contenteditable="true" id="unrelated">保持原样</div>',
  );
  expect(
    await fillDouyinVideoMetadata(wc, { title: "标题", body: "简介" }),
  ).toBe(true);
  expect(document.querySelector("#unrelated")!.textContent).toBe("保持原样");
});
it("拒绝截断标题或简介，话题纳入1000字限制", async () => {
  const wc = form();
  expect(
    await fillDouyinVideoMetadata(wc, { title: "字".repeat(29) + "😀" }),
  ).toBe(false);
  expect(
    await fillDouyinVideoMetadata(wc, {
      title: "标题",
      body: "字".repeat(1000),
      tags: ["话题"],
    }),
  ).toBe(false);
  expect(wc.executeJavaScript).not.toHaveBeenCalled();
});
it("编辑器标识不唯一时停止填写", async () => {
  const wc = form();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div contenteditable="true" data-slate-editor="true"></div>',
  );
  expect(await fillDouyinVideoMetadata(wc, { title: "标题" })).toBe(false);
  expect(wc.insertText).not.toHaveBeenCalled();
});
it("应用私密、禁止下载并正确转换为本地定时", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
  const wc = form();
  const iso = "2026-10-06T04:00:00Z";
  expect(
    await applyDouyinVideoSettings(wc, {
      title: "标题",
      visibility: "private",
      allowDownload: false,
      scheduledAt: iso,
    }),
  ).toBe(true);
  expect(
    Array.from(document.querySelectorAll("label input:checked")).map(
      (e) => e.parentElement!.textContent,
    ),
  ).toEqual(["仅自己可见", "不允许", "定时发布"]);
  expect(
    document.querySelector<HTMLInputElement>('input[placeholder="日期和时间"]')!
      .value,
  ).toBe(douyinVideoScheduleText(iso));
  expect(wc.sendInputEvent).toHaveBeenCalledWith({
    type: "keyDown",
    keyCode: "Enter",
  });
});
it("切回立即发布必须反选定时", async () => {
  const wc = form();
  const labels = Array.from(document.querySelectorAll("label"));
  labels.find((e) => e.textContent === "定时发布")!.click();
  expect(await applyDouyinVideoSettings(wc, { title: "标题" })).toBe(true);
  expect(
    labels.find((e) => e.textContent === "立即发布")!.querySelector("input")!
      .checked,
  ).toBe(true);
  expect(
    labels.find((e) => e.textContent === "定时发布")!.querySelector("input")!
      .checked,
  ).toBe(false);
});
it("超出窗口或无效定时不改动页面", async () => {
  const wc = form();
  expect(
    await applyDouyinVideoSettings(wc, {
      title: "标题",
      scheduledAt: "invalid",
    }),
  ).toBe(false);
  expect(wc.executeJavaScript).not.toHaveBeenCalled();
  expect(
    douyinVideoScheduleText(new Date(Date.now() + 3600_000).toISOString()),
  ).toBeNull();
  expect(
    douyinVideoScheduleText(
      new Date(Date.now() + 15 * 86400_000).toISOString(),
    ),
  ).toBeNull();
});
it("平台不接受权限选择时停止，不能只根据点击成功继续发布", async () => {
  const wc = form();
  const input = document.querySelector<HTMLInputElement>("label input")!;
  input.disabled = true;
  expect(
    await applyDouyinVideoSettings(wc, { title: "标题", visibility: "public" }),
  ).toBe(false);
});
it("横竖封面按标签选择对应入口，并要求封面回显发生变化", async () => {
  const wc = form();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="coverControl-test"><img src="https://test.invalid/old" /><div>选择封面</div><div>横封面4:3</div></div><div class="coverControl-test"><img src="https://test.invalid/portrait" /><div>选择封面</div><div>竖封面3:4</div></div>`,
  );
  const triggers = Array.from(
    document.querySelectorAll(".coverControl-test"),
  ).map((e) => e.children[1]);
  const clicks = triggers.map(() => vi.fn());
  triggers.forEach((e, i) => e.addEventListener("click", clicks[i]));
  const previous = await openDouyinVideoCover(wc, "portrait");
  expect(previous).toBe("https://test.invalid/portrait");
  expect(clicks[0]).not.toHaveBeenCalled();
  expect(clicks[1]).toHaveBeenCalledOnce();
  expect(await verifyDouyinVideoCover(wc, "portrait", previous!)).toBe(false);
  const image = document.querySelectorAll<HTMLImageElement>(
    ".coverControl-test img",
  )[1];
  image.src = "https://test.invalid/new";
  Object.defineProperty(image, "complete", { value: true });
  Object.defineProperty(image, "naturalWidth", { value: 1080 });
  expect(await verifyDouyinVideoCover(wc, "portrait", previous!)).toBe(true);
});

it("候选项没有生成平台话题实体时停止，普通文字不能视为话题成功", async () => {
  const wc = form(false);
  expect(
    await fillDouyinVideoMetadata(wc, { title: "标题", tags: ["美食"] }),
  ).toBe(false);
  expect(document.querySelector('[data-mention="#"]')).toBeNull();
});

it("已有封面支持重新编辑，并只关闭保存横封面后的推荐弹窗", async () => {
  const wc = form();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="coverControl-test"><img src="https://test.invalid/saved" /><div>编辑封面</div><div>竖封面3:4</div></div><div role="dialog">设置竖封面获更多流量<button>暂不设置</button></div><div role="dialog"><button>暂不设置</button></div>`,
  );
  const edit = vi.fn();
  document
    .querySelector(".coverControl-test div")!
    .addEventListener("click", edit);
  expect(await openDouyinVideoCover(wc, "portrait")).toBe(
    "https://test.invalid/saved",
  );
  expect(edit).toHaveBeenCalledOnce();
  const buttons = document.querySelectorAll('[role="dialog"] button');
  const dismiss = vi.fn();
  const unrelated = vi.fn();
  buttons[0].addEventListener("click", dismiss);
  buttons[1].addEventListener("click", unrelated);
  await dismissDouyinVideoCoverRecommendation(wc);
  expect(dismiss).toHaveBeenCalledOnce();
  expect(unrelated).not.toHaveBeenCalled();
});
