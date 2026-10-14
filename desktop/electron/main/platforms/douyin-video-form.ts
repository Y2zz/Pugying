import type { WebContents } from "electron";
import type { PlatformPublishStartPayload } from "../publish-protocol";
import { applyDouyinGraphicSettings } from "./douyin-graphic-form";
import { composeDouyinGraphicDescription } from "../../../shared/douyin-graphic-settings";

type VideoSettings = Pick<
  PlatformPublishStartPayload,
  | "title"
  | "body"
  | "tags"
  | "visibility"
  | "allowDownload"
  | "scheduledAt"
  | "authorDeclaration"
>;
export const VIDEO_TITLE_SELECTOR =
  'input[placeholder="填写作品标题，为作品获得更多流量"]';
export const VIDEO_DESCRIPTION_SELECTOR =
  '[contenteditable="true"][data-slate-editor="true"]';

/** 实测视频编辑器的标题和 Slate 简介，不能按 contenteditable 出现顺序填写。 */
export async function fillDouyinVideoMetadata(
  wc: WebContents,
  payload: VideoSettings,
): Promise<boolean> {
  const title = payload.title.trim();
  const description = composeDouyinGraphicDescription(
    payload.body ?? "",
    payload.tags ?? [],
  );
  if (!title || title.length > 30 || description.length > 1000) {
    return false;
  }
  const ready = await wc.executeJavaScript(`(() => {
    const titles = document.querySelectorAll(${JSON.stringify(VIDEO_TITLE_SELECTOR)});
    const editors = document.querySelectorAll(${JSON.stringify(VIDEO_DESCRIPTION_SELECTOR)});
    if (titles.length !== 1 || editors.length !== 1) { return false; }
    const title = titles[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter || title.disabled) { return false; }
    setter.call(title, ${JSON.stringify(title)});
    title.dispatchEvent(new Event('input', { bubbles: true }));
    title.dispatchEvent(new Event('change', { bubbles: true }));
    editors[0].focus();
    const range = document.createRange();
    range.selectNodeContents(editors[0]);
    const selection = window.getSelection();
    if (!selection) { return false; }
    selection.removeAllRanges();
    selection.addRange(range);
    return title.value === ${JSON.stringify(title)};
  })()`);
  if (!ready) {
    return false;
  }
  // 让平台的 Slate 编辑器处理真实输入，避免只修改 DOM 而丢失编辑状态。
  await wc.insertText(description);
  for (const tag of [
    ...new Set(
      (payload.tags ?? [])
        .map((tag) => tag.trim().replace(/^#+/, ""))
        .filter(Boolean),
    ),
  ]) {
    if (!(await selectDouyinVideoTopic(wc, tag))) {
      return false;
    }
  }
  return wc.executeJavaScript(`(() => {
    const editor = document.querySelector(${JSON.stringify(VIDEO_DESCRIPTION_SELECTOR)});
    const clean = (text) => text.replace(/[\u200b\ufeff]/g, '').replace(/\\s+/g, ' ').trim();
    return document.querySelector(${JSON.stringify(VIDEO_TITLE_SELECTOR)})?.value === ${JSON.stringify(title)} &&
      clean(editor?.innerText ?? editor?.textContent ?? '') === clean(${JSON.stringify(description)});
  })()`);
}

export function douyinVideoScheduleText(iso: string): string | null {
  const date = new Date(iso);
  const now = Date.now();
  if (
    !Number.isFinite(date.getTime()) ||
    date.getTime() < now + 2 * 3600_000 ||
    date.getTime() > now + 14 * 86400_000
  ) {
    return null;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 权限、声明和本地定时时间必须全部应用并核对，失败即停止自动提交。 */
export async function applyDouyinVideoSettings(
  wc: WebContents,
  payload: VideoSettings,
): Promise<boolean> {
  const dateText = payload.scheduledAt
    ? douyinVideoScheduleText(payload.scheduledAt)
    : "";
  if (dateText === null) {
    return false;
  }
  // 视频和图文在当前后台采用相同的权限/自主声明控件，已分别实测核对。
  if (!(await applyDouyinGraphicSettings(wc, payload))) {
    return false;
  }
  const mode = dateText ? "定时发布" : "立即发布";
  const selected = await wc.executeJavaScript(`(() => {
    const labels = Array.from(document.querySelectorAll('label')).filter((label) =>
      label.textContent.trim() === ${JSON.stringify(mode)} && label.querySelector('input[type="checkbox"]'));
    if (labels.length !== 1 || labels[0].querySelector('input').disabled) { return false; }
    if (!labels[0].querySelector('input').checked) { labels[0].click(); }
    return true;
  })()`);
  if (!selected) {
    return false;
  }
  if (dateText) {
    const filled = await wc.executeJavaScript(`(() => {
      const inputs = document.querySelectorAll('input[placeholder="日期和时间"]');
      if (inputs.length !== 1 || inputs[0].disabled) { return false; }
      const input = inputs[0];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setter) { return false; }
      input.focus();
      setter.call(input, ${JSON.stringify(dateText)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!filled) {
      return false;
    }
    wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await wc.executeJavaScript(
      `document.querySelector('input[placeholder="日期和时间"]')?.blur()`,
    );
  }
  return wc.executeJavaScript(`(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const checked = (text) => labels.filter((label) => label.textContent.trim() === text && label.querySelector('input[type="checkbox"]'));
    const selected = checked(${JSON.stringify(mode)});
    const other = checked(${JSON.stringify(dateText ? "立即发布" : "定时发布")});
    const input = document.querySelector('input[placeholder="日期和时间"]');
    return selected.length === 1 && selected[0].querySelector('input').checked === true &&
      other.length === 1 && other[0].querySelector('input').checked === false &&
      (${JSON.stringify(dateText)} === '' || input?.value === ${JSON.stringify(dateText)});
  })()`);
}

/** 以横/竖封面标签定位槽位，不得向第一个 image input 连续挂两张图。 */
export async function openDouyinVideoCover(
  wc: WebContents,
  aspect: "portrait" | "landscape",
): Promise<string | null> {
  const label = aspect === "portrait" ? "竖封面3:4" : "横封面4:3";
  return wc.executeJavaScript(`(() => {
    const nodes = Array.from(document.querySelectorAll('div')).filter((node) => node.children.length === 0 && node.textContent.trim() === ${JSON.stringify(label)});
    if (nodes.length !== 1) { return null; }
    const slot = nodes[0].closest('[class^="coverControl-"]');
    const trigger = slot && Array.from(slot.querySelectorAll('div')).find((node) => node.children.length === 0 && ['选择封面', '编辑封面'].includes(node.textContent.trim()));
    if (!trigger) { return null; }
    const previous = slot.querySelector('img')?.src ?? '';
    trigger.click();
    return previous;
  })()`);
}

/** 保存首张横封面时，平台会推荐竖封面；关闭推荐后再按所选槽位设置。 */
export async function dismissDouyinVideoCoverRecommendation(
  wc: WebContents,
): Promise<void> {
  await wc.executeJavaScript(`(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((dialog) => dialog.textContent.includes('设置竖封面获更多流量'));
    if (dialogs.length !== 1) { return; }
    const buttons = Array.from(dialogs[0].querySelectorAll('button')).filter((button) => button.textContent.trim() === '暂不设置' && !button.disabled);
    if (buttons.length === 1) { buttons[0].click(); }
  })()`);
}

export async function verifyDouyinVideoCover(
  wc: WebContents,
  aspect: "portrait" | "landscape",
  previous: string,
): Promise<boolean> {
  const label = aspect === "portrait" ? "竖封面3:4" : "横封面4:3";
  return wc.executeJavaScript(`(() => {
    if (document.querySelector('[role="dialog"]')) { return false; }
    const nodes = Array.from(document.querySelectorAll('div')).filter((node) => node.children.length === 0 && node.textContent.trim() === ${JSON.stringify(label)});
    if (nodes.length !== 1) { return false; }
    const image = nodes[0].closest('[class^="coverControl-"]')?.querySelector('img');
    return Boolean(image?.src && image.src !== ${JSON.stringify(previous)} && image.complete && image.naturalWidth > 0);
  })()`);
}

/** 将已写入的普通 #文字选为平台话题实体，只有回显实体才能继续发布。 */
async function selectDouyinVideoTopic(
  wc: WebContents,
  tag: string,
): Promise<boolean> {
  if (/\s/.test(tag)) {
    return false;
  }
  const selected = await wc.executeJavaScript(`(() => {
    const editor = document.querySelector(${JSON.stringify(VIDEO_DESCRIPTION_SELECTOR)});
    if (!editor) { return null; }
    const topic = ${JSON.stringify("#")} + ${JSON.stringify(tag)};
    if (Array.from(editor.querySelectorAll('[data-mention="#"]')).some((node) => node.textContent.trim() === topic)) { return 'present'; }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('[data-mention="#"]')) { continue; }
      const index = node.textContent.indexOf(topic);
      if (index < 0 || (node.textContent[index + topic.length] && !/\\s/.test(node.textContent[index + topic.length]))) { continue; }
      editor.focus();
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + topic.length);
      const selection = window.getSelection();
      if (!selection) { return null; }
      selection.removeAllRanges();
      selection.addRange(range);
      return 'select';
    }
    return null;
  })()`);
  if (selected === "present") {
    return true;
  }
  if (selected !== "select") {
    return false;
  }
  await wc.insertText("#");
  await wc.insertText(tag);
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const clicked = await wc.executeJavaScript(`(() => {
      const candidates = Array.from(document.querySelectorAll('div[class*="tag-hash-"]')).filter((node) =>
        node.querySelector('span[class^="tag-hash-view-name-"]')?.textContent === ${JSON.stringify(tag)} && node.getClientRects().length > 0);
      if (candidates.length !== 1) { return false; }
      candidates[0].click();
      return true;
    })()`);
    if (clicked) {
      return wc.executeJavaScript(`(() => {
        const editor = document.querySelector(${JSON.stringify(VIDEO_DESCRIPTION_SELECTOR)});
        return Boolean(editor && Array.from(editor.querySelectorAll('[data-mention="#"]')).some((node) => node.textContent.trim() === ${JSON.stringify("#" + tag)}));
      })()`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
