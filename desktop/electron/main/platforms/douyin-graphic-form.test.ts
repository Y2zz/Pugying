// @vitest-environment jsdom
import { fillDouyinGraphicMetadata, applyDouyinGraphicSettings } from './douyin-graphic-form';
import {
  DOUYIN_AUTHOR_DECLARATIONS,
  composeDouyinGraphicDescription,
} from '../../../shared/douyin-graphic-settings';
import type { WebContents } from 'electron';

function creatorForm() {
  document.body.innerHTML = `
    <input placeholder="添加作品标题" />
    <div contenteditable="true" data-placeholder="添加作品描述..."><span>旧描述</span></div>
    <div><label><input type="checkbox" checked />公开</label><label><input type="checkbox" />好友可见</label><label><input type="checkbox" />仅自己可见</label></div>
    <div><label><input type="checkbox" checked />允许</label><label><input type="checkbox" />不允许</label></div>
    <span id="declaration">请选择自主声明</span>`;
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    input.addEventListener('change', () => {
      for (const sibling of input.parentElement!.parentElement!.querySelectorAll<HTMLInputElement>(
        'input',
      )) {
        sibling.checked = sibling === input;
      }
    });
  }
  document.querySelector('#declaration')!.addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'semi-modal';
    modal.innerHTML =
      DOUYIN_AUTHOR_DECLARATIONS.map(
        (option) => `<label><input type="radio" name="declaration" />${option.label}</label>`,
      ).join('') + '<button disabled>确定</button>';
    modal.addEventListener('change', () => {
      modal.querySelector('button')!.disabled = false;
    });
    modal.querySelector('button')!.addEventListener('click', () => {
      document.querySelector('#declaration')!.textContent = modal
        .querySelector('input:checked')!
        .closest('label')!.textContent;
      modal.remove();
    });
    document.body.append(modal);
  });
  return {
    executeJavaScript: vi.fn(async (script: string) => window.eval(script)),
    insertText: vi.fn(async (text: string) => {
      const selection = window.getSelection()!;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    }),
  } as unknown as WebContents;
}

afterEach(() => {
  document.body.innerHTML = '';
});

it('preserves the complete title and description, adds topics once and uses editor input', async () => {
  const wc = creatorForm();
  expect(
    await fillDouyinGraphicMetadata(wc, {
      title: '图文标题',
      body: '描述 #旅行',
      tags: ['旅行', '美食'],
    }),
  ).toBe(true);
  expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('图文标题');
  expect(document.querySelector('[contenteditable]')!.textContent).toBe('描述 #旅行\n#美食');
  expect(wc.insertText).toHaveBeenCalledWith('描述 #旅行\n#美食');
});

it('rejects excessive content before changing the creator form', async () => {
  const wc = creatorForm();
  expect(await fillDouyinGraphicMetadata(wc, { title: '标'.repeat(21), body: '描述' })).toBe(false);
  expect(
    await fillDouyinGraphicMetadata(wc, { title: '标题', body: '文'.repeat(1000), tags: ['旅行'] }),
  ).toBe(false);
  expect(wc.executeJavaScript).not.toHaveBeenCalled();
});

it('applies privacy, saving permission and the selected declaration', async () => {
  const wc = creatorForm();
  expect(
    await applyDouyinGraphicSettings(wc, {
      title: '标题',
      visibility: 'private',
      allowDownload: false,
      authorDeclaration: 'ai_generated',
    }),
  ).toBe(true);
  const checked = Array.from(document.querySelectorAll('input:checked')).map(
    (input) => input.closest('label')!.textContent,
  );
  expect(checked).toEqual(['仅自己可见', '不允许']);
  expect(document.querySelector('#declaration')!.textContent).toBe('内容由AI生成');
  expect(document.querySelector('.semi-modal')).toBeNull();
});

it('supports the default declaration without opening a confirmation dialog', async () => {
  const wc = creatorForm();
  expect(await applyDouyinGraphicSettings(wc, { title: '标题' })).toBe(true);
  expect(document.querySelector('.semi-modal')).toBeNull();
});

it('stops when a requested permission is missing or disabled', async () => {
  const wc = creatorForm();
  document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2].disabled = true;
  expect(await applyDouyinGraphicSettings(wc, { title: '标题', visibility: 'private' })).toBe(
    false,
  );
  expect(await applyDouyinGraphicSettings(wc, { title: '标题', visibility: 'unknown' })).toBe(
    false,
  );
});

it('does not duplicate existing topics', () => {
  expect(composeDouyinGraphicDescription('正文 #旅行 #美食', ['旅行', '旅行', '美食'])).toBe(
    '正文 #旅行 #美食',
  );
});
