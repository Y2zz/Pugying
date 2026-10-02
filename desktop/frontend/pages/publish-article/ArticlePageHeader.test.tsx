// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArticlePageHeader } from './ArticlePageHeader';
import type { ArticleCheck } from './use-article-composer';

const missingTitle: ArticleCheck = { id: 'title', label: '标题', ok: false, detail: '未填写' };

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return new DOMRect(0, 0, 800, this.closest('[data-compact="true"]') ? 56 : 160);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(checks = [missingTitle]) {
  const onSave = vi.fn();
  const onFix = vi.fn(() => {
    screen.getByRole('textbox', { name: '文章标题' }).focus();
  });
  render(
    <main>
      <ArticlePageHeader
        title="发布文章"
        description="先写内容，再设封面并选择分发账号"
        checks={checks}
        loading={false}
        disabled={false}
        saveLabel="保存草稿"
        onSave={onSave}
        onFix={onFix}
      />
      <input aria-label="文章标题" />
    </main>,
  );
  const scroller = screen.getByRole('main');
  const scrollTo = (top: number) => {
    scroller.scrollTop = top;
    fireEvent.scroll(scroller);
  };
  return { onSave, onFix, scrollTo, scroller };
}

it('compacts on the main scroll container and preserves the document height and save button', () => {
  const { scrollTo, onSave, scroller } = setup();
  const save = screen.getByRole('button', { name: '保存草稿' });
  const header = scroller.querySelector<HTMLElement>('[data-compact]')!;
  expect(header.style.height).toBe('160px');
  scrollTo(120);
  expect(header.dataset.compact).toBe('true');
  expect(header.style.height).toBe('160px');
  expect(screen.queryByText('先写内容，再设封面并选择分发账号')).toBeNull();
  expect(screen.getByRole('button', { name: '还差 1 项' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '保存草稿' })).toBe(save);
  fireEvent.click(save);
  expect(onSave).toHaveBeenCalledOnce();
  scrollTo(0);
  expect(header.dataset.compact).toBe('false');
  expect(screen.getByText('先写内容，再设封面并选择分发账号')).toBeTruthy();
});

it('opens pending checks and focuses the field when a check is selected', async () => {
  const { scrollTo, onFix } = setup();
  scrollTo(120);
  fireEvent.click(screen.getByRole('button', { name: '还差 1 项' }));
  fireEvent.click(await screen.findByRole('button', { name: /标题.*未填写/ }));
  expect(onFix).toHaveBeenCalledWith(missingTitle);
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /标题.*未填写/ })).toBeNull();
  });
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '文章标题' }));
});

it('shows ready status after all checks pass', () => {
  const { scrollTo } = setup([{ ...missingTitle, ok: true }]);
  scrollTo(120);
  expect(screen.getByRole('button', { name: '已就绪' })).toBeTruthy();
});
