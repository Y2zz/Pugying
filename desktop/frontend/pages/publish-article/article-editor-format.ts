import { Extension, Mark, mergeAttributes } from '@tiptap/react';

export const ARTICLE_COLORS = ['#b91c1c', '#1d4ed8', '#15803d'];
export const ARTICLE_BACKGROUNDS = ['#fef08a', '#bfdbfe'];
export const ARTICLE_FONT_SIZES = ['16px', '18px', '20px'];
export const ARTICLE_ALIGNMENTS = ['left', 'center', 'right'];

export function permittedStyle(
  value: string,
  allowed: string[],
): string | null {
  // 浏览器会把十六进制颜色标准化为 rgb()。
  const normalize = (input: string) => {
    const element = document.createElement('span');
    element.style.color = input;
    return element.style.color;
  };
  return (
    allowed.find(
      (candidate) =>
        candidate === value ||
        (normalize(candidate) === normalize(value) &&
          Boolean(normalize(value))),
    ) || null
  );
}

export const ArticleTextStyle = Mark.create({
  name: 'articleTextStyle',
  addAttributes() {
    return Object.fromEntries(
      [
        ['color', ARTICLE_COLORS],
        ['backgroundColor', ARTICLE_BACKGROUNDS],
        ['fontSize', ARTICLE_FONT_SIZES],
      ].map(([key, values]) => [
        key as string,
        {
          default: null,
          parseHTML: (element: HTMLElement) =>
            permittedStyle(element.style[key as 'color'], values as string[]),
          renderHTML: (attributes: Record<string, unknown>) => {
            const value = attributes[key as string];
            const css =
              key === 'backgroundColor'
                ? 'background-color'
                : key === 'fontSize'
                  ? 'font-size'
                  : 'color';
            return value ? { style: `${css}: ${value}` } : {};
          },
        },
      ]),
    );
  },
  parseHTML() {
    return [{ tag: 'span[style]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

export const ArticleAlignment = Extension.create({
  name: 'articleAlignment',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              ARTICLE_ALIGNMENTS.includes(element.style.textAlign)
                ? element.style.textAlign
                : null,
            renderHTML: (attributes: Record<string, unknown>) =>
              ARTICLE_ALIGNMENTS.includes(String(attributes.textAlign))
                ? { style: `text-align: ${attributes.textAlign}` }
                : {},
          },
        },
      },
    ];
  },
});
