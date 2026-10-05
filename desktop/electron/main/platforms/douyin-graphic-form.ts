import type { WebContents } from 'electron';
import {
  DOUYIN_AUTHOR_DECLARATIONS,
  composeDouyinGraphicDescription,
} from '../../../shared/douyin-graphic-settings';
import type { PlatformPublishStartPayload } from '../publish-protocol';

type GraphicSettings = Pick<
  PlatformPublishStartPayload,
  'title' | 'body' | 'tags' | 'visibility' | 'allowDownload' | 'authorDeclaration'
>;

/** 按占位文案定位输入，不依赖富文本编辑器在页面中的顺序。 */
export async function fillDouyinGraphicMetadata(
  wc: WebContents,
  payload: GraphicSettings,
): Promise<boolean> {
  const title = payload.title.trim();
  const body = composeDouyinGraphicDescription(payload.body ?? '', payload.tags ?? []);
  if (Array.from(title).length > 20 || body.length > 1000) {
    return false;
  }
  const ready = await wc.executeJavaScript(`(() => {
    const title = ${JSON.stringify(title)};
    const input = document.querySelector('input[placeholder="添加作品标题"]');
    const editor = document.querySelector('[contenteditable="true"][data-placeholder="添加作品描述..."]');
    if (!input || !editor) { return false; }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) { return false; }
    setter.call(input, title);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    if (!selection) { return false; }
    selection.removeAllRanges();
    selection.addRange(range);
    return input.value === title;
  })()`);
  if (!ready) {
    return false;
  }
  // Chromium 的编辑输入交由平台编辑器处理，保持话题文案和编辑器状态同步。
  await wc.insertText(body);
  return wc.executeJavaScript(`(() => {
    const input = document.querySelector('input[placeholder="添加作品标题"]');
    const editor = document.querySelector('[contenteditable="true"][data-placeholder="添加作品描述..."]');
    const clean = (text) => text.replace(/[\u200b\ufeff]/g, '').replace(/\\s+/g, ' ').trim();
    return input?.value === ${JSON.stringify(title)} &&
      clean(editor?.innerText ?? editor?.textContent ?? '') === clean(${JSON.stringify(body)});
  })()`);
}

async function chooseRadio(
  wc: WebContents,
  label: string,
  type: 'checkbox' | 'radio',
): Promise<boolean> {
  const clicked = await wc.executeJavaScript(`(() => {
    const matches = Array.from(document.querySelectorAll('label')).filter((node) =>
      node.textContent.trim() === ${JSON.stringify(label)} && node.querySelector('input[type="${type}"]'));
    if (matches.length !== 1) { return false; }
    const input = matches[0].querySelector('input');
    if (input.disabled) { return false; }
    if (!input.checked) { matches[0].click(); }
    return true;
  })()`);
  if (!clicked) {
    return false;
  }
  return wc.executeJavaScript(`(() => {
    const node = Array.from(document.querySelectorAll('label')).find((node) =>
      node.textContent.trim() === ${JSON.stringify(label)} && node.querySelector('input[type="${type}"]'));
    return node?.querySelector('input')?.checked === true;
  })()`);
}

/** 发布前核对权限与声明；任一项无法应用时停止自动提交。 */
export async function applyDouyinGraphicSettings(
  wc: WebContents,
  payload: GraphicSettings,
): Promise<boolean> {
  const visibility = { public: '公开', friends: '好友可见', private: '仅自己可见' };
  const visibilityLabel = visibility[(payload.visibility ?? 'public') as keyof typeof visibility];
  if (!visibilityLabel || !(await chooseRadio(wc, visibilityLabel, 'checkbox'))) {
    return false;
  }
  if (!(await chooseRadio(wc, payload.allowDownload === false ? '不允许' : '允许', 'checkbox'))) {
    return false;
  }
  const declaration = DOUYIN_AUTHOR_DECLARATIONS.find(
    (item) => item.value === (payload.authorDeclaration ?? 'none'),
  );
  if (!declaration) {
    return false;
  }
  if (declaration.value === 'none') {
    return wc.executeJavaScript(`(() => {
      return Array.from(document.querySelectorAll('span,div,p,button')).some((node) =>
        node.children.length === 0 && ['请选择自主声明', '无需添加自主声明'].includes(node.textContent.trim()));
    })()`);
  }
  const opened = await wc.executeJavaScript(`(() => {
    const trigger = Array.from(document.querySelectorAll('span,div,button')).find((node) =>
      node.children.length === 0 && node.textContent.trim() === '请选择自主声明');
    if (!trigger) { return false; }
    trigger.click();
    return true;
  })()`);
  if (!opened || !(await chooseRadio(wc, declaration.label, 'radio'))) {
    return false;
  }
  const confirmed = await wc.executeJavaScript(`(() => {
    const modal = document.querySelector('.semi-modal');
    const buttons = modal ? Array.from(modal.querySelectorAll('button')) : [];
    const confirm = buttons.find((button) => button.textContent.trim() === '确定');
    if (!confirm || confirm.disabled) { return false; }
    confirm.click();
    return true;
  })()`);
  if (!confirmed) {
    return false;
  }
  return wc.executeJavaScript(`(() => {
    return !document.querySelector('.semi-modal') && Array.from(document.querySelectorAll('span,div,p')).some((node) =>
      node.children.length === 0 && node.textContent.trim() === ${JSON.stringify(declaration.label)});
  })()`);
}
