import { cleanArticlePaste } from './article-editor-paste';

/** 保守输出策略：尚未验证的平台样式简化为基础排版，原稿不变。 */
export function articleBodyPreview(
  html: string,
  platform: string,
): { html: string; simplified: boolean } {
  const clean = cleanArticlePaste(html, true);
  const document = new DOMParser().parseFromString(clean.html, 'text/html');
  let simplified = clean.simplified;
  if (platform !== 'common' && platform !== 'bilibili') {
    for (const element of Array.from(
      document.body.querySelectorAll('[style]'),
    )) {
      element.removeAttribute('style');
      simplified = true;
    }
    for (const heading of Array.from(document.body.querySelectorAll('h3'))) {
      const replacement = document.createElement('h2');
      replacement.append(...Array.from(heading.childNodes));
      heading.replaceWith(replacement);
      simplified = true;
    }
  }
  if (platform === 'douyin') {
    for (const element of Array.from(document.body.querySelectorAll('s, hr'))) {
      element.replaceWith(...Array.from(element.childNodes));
      simplified = true;
    }
  }
  return { html: document.body.innerHTML, simplified };
}
