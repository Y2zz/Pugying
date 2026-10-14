// @vitest-environment jsdom
import { scrollToArticleField } from './scroll-to-article-field';

function setup({ targetTop = 400, targetHeight = 500, scrollTop = 300 } = {}) {
  document.body.innerHTML = `
    <main>
      <div data-compact="true">
        <div data-slot="article-page-header-surface"></div>
      </div>
      <section></section>
    </main>
  `;
  const scroller = document.querySelector('main')!;
  const header = scroller.firstElementChild as HTMLElement;
  const surface = header.firstElementChild as HTMLElement;
  const target = scroller.querySelector('section')!;
  scroller.scrollTop = scrollTop;
  Object.defineProperty(scroller, 'clientHeight', { value: 600 });
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 40, 800, 600));
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 40, 800, 160));
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 40, 800, 56));
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, targetTop, 800, targetHeight));
  const scrollTo = vi.fn();
  scroller.scrollTo = scrollTo;
  return { target, scrollTo };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('positions the body below the compact header in the main viewport', () => {
  const { target, scrollTo } = setup();
  scrollToArticleField(target, 'start');
  expect(scrollTo).toHaveBeenCalledWith({ top: 588, behavior: 'smooth' });
});

it('reserves the expanded header when returning near the top of the page', () => {
  const { target, scrollTo } = setup({ targetTop: 170, scrollTop: 0 });
  scrollToArticleField(target, 'start');
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
});

it('centers short fields within the area below the header', () => {
  const { target, scrollTo } = setup({ targetHeight: 40 });
  scrollToArticleField(target);
  expect(scrollTo).toHaveBeenCalledWith({ top: 344, behavior: 'smooth' });
});
