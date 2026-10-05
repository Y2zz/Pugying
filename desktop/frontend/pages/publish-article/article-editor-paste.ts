import {
  ARTICLE_ALIGNMENTS,
  ARTICLE_BACKGROUNDS,
  ARTICLE_COLORS,
  ARTICLE_FONT_SIZES,
  permittedStyle,
} from './article-editor-format';

/** 链接只接受网页地址；省略协议时补全 HTTPS。 */
export function normalizeArticleLink(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || /^[/#?.]/.test(trimmed)) {
    return null;
  }
  const source = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(source);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/** 保留正文结构和基础文字格式，清理网页/Word 的装饰与不支持的节点。 */
export function cleanArticlePaste(
  html: string,
  preserveStyles = false,
): {
  html: string;
  simplified: boolean;
} {
  const document = new DOMParser().parseFromString(html, 'text/html');
  let simplified = false;
  const allowed = new Set([
    'p',
    'br',
    'strong',
    'em',
    'u',
    'h2',
    'h3',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    's',
    'hr',
    'img',
    'figure',
    'figcaption',
  ]);
  const visit = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || '');
    }
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'iframe', 'object', 'noscript'].includes(tag)) {
      simplified = true;
      return null;
    }
    const mapped = /^(h[1-6])$/.test(tag)
      ? tag === 'h3'
        ? 'h3'
        : 'h2'
      : ['div', 'pre', 'td', 'th'].includes(tag)
        ? 'p'
        : tag === 'b'
          ? 'strong'
          : tag === 'i'
            ? 'em'
            : ['strike', 'del'].includes(tag)
              ? 's'
              : tag;
    if (['table', 'pre', 'code', 'math'].includes(tag)) {
      simplified = true;
    }
    let output: Node = allowed.has(mapped)
      ? document.createElement(mapped)
      : document.createDocumentFragment();
    if (output instanceof HTMLElement) {
      if (
        preserveStyles &&
        ['p', 'h2', 'h3'].includes(mapped) &&
        ARTICLE_ALIGNMENTS.includes(node.style.textAlign)
      ) {
        output.style.textAlign = node.style.textAlign;
      }
      if (mapped === 'a') {
        const href = normalizeArticleLink(node.getAttribute('href') || '');
        if (href) {
          output.setAttribute('href', href);
        } else {
          output = document.createDocumentFragment();
        }
      } else if (mapped === 'img') {
        const src = node.getAttribute('src') || '';
        if (!/^(https?:\/\/|file:\/\/)/i.test(src)) {
          simplified = true;
          return null;
        }
        for (const attribute of ['src', 'alt', 'title', 'data-local-path']) {
          const value = node.getAttribute(attribute);
          if (value) {
            output.setAttribute(attribute, value);
          }
        }
      } else if (
        mapped === 'figure' &&
        node.hasAttribute('data-article-image')
      ) {
        output.setAttribute('data-article-image', '');
      } else if (
        mapped === 'ol' &&
        /^\d+$/.test(node.getAttribute('start') || '')
      ) {
        output.setAttribute('start', node.getAttribute('start')!);
      }
    }
    for (const child of Array.from(node.childNodes)) {
      const cleaned = visit(child);
      if (cleaned) {
        output.appendChild(cleaned);
      }
    }
    // Word 常用 span 的行内样式表达加粗、斜体与下划线。
    if (tag === 'span') {
      const formats = [
        ['strong', /^(bold|[6-9]00)$/.test(node.style.fontWeight)],
        ['em', node.style.fontStyle === 'italic'],
        ['u', /underline/.test(node.style.textDecoration)],
      ] as const;
      for (const [format, enabled] of formats) {
        if (enabled) {
          const wrapper = document.createElement(format);
          wrapper.appendChild(output);
          output = wrapper;
        }
      }
    }
    if (
      preserveStyles &&
      ['span', 'strong', 'em', 'u', 's', 'a'].includes(mapped)
    ) {
      const styles = [
        ['color', ARTICLE_COLORS],
        ['backgroundColor', ARTICLE_BACKGROUNDS],
        ['fontSize', ARTICLE_FONT_SIZES],
      ] as const;
      const wrapper = document.createElement('span');
      for (const [key, allowed] of styles) {
        const value = permittedStyle(node.style[key], allowed);
        if (value) {
          wrapper.style[key] = value;
        }
      }
      if (wrapper.style.length) {
        wrapper.appendChild(output);
        output = wrapper;
      }
    }
    return output;
  };
  const output = document.createElement('div');
  for (const child of Array.from(document.body.childNodes)) {
    const cleaned = visit(child);
    if (cleaned) {
      output.appendChild(cleaned);
    }
  }
  return { html: output.innerHTML, simplified };
}
