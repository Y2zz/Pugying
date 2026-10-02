/** 在本机主内容滚动区定位字段，为吸顶页头预留可见空间。 */
export function scrollToArticleField(
  element: HTMLElement | null,
  block: ScrollLogicalPosition = 'center',
) {
  if (!element) {
    return;
  }
  const scroller = element.closest('main');
  if (!scroller) {
    element.scrollIntoView({ behavior: 'smooth', block });
    return;
  }

  const surface = scroller.querySelector<HTMLElement>('[data-slot="article-page-header-surface"]');
  const header = surface?.parentElement;
  const target = element.getBoundingClientRect();
  const viewportTop = scroller.getBoundingClientRect().top + scroller.clientTop;
  const targetTop = target.top - viewportTop + scroller.scrollTop;
  let inset = (surface?.getBoundingClientRect().height ?? 0) + 16;
  let top = targetTop - inset;

  if (block === 'center' && target.height < scroller.clientHeight - inset) {
    top -= (scroller.clientHeight - inset - target.height) / 2;
  }

  // 回到页顶时页头会重新展开，使用保留的完整高度避免字段再次被盖住。
  if (top <= 80 && header?.dataset.compact === 'true') {
    inset = header.getBoundingClientRect().height + 16;
    top = targetTop - inset;
    if (block === 'center' && target.height < scroller.clientHeight - inset) {
      top -= (scroller.clientHeight - inset - target.height) / 2;
    }
  }

  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}
