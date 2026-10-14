import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

const TEXT_TAGS = [
  'p',
  'h2',
  'blockquote',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'u',
  's',
  'br',
  'a',
  'code',
  'pre',
  'hr',
] as const;
type ArticleTag = (typeof TEXT_TAGS)[number];
export type ArticlePublishNode =
  | { kind: 'text'; text: string }
  | {
      kind: 'element';
      tag: ArticleTag;
      href?: string;
      children: ArticlePublishNode[];
    }
  | { kind: 'image'; localPath: string; alt: string; caption: string };
export interface ArticlePublishDocument {
  nodes: ArticlePublishNode[];
  imagePaths: string[];
}

/** 内部草稿先解析成正文与本机图片，平台适配器不接收编辑器 HTML。 */
export function prepareArticleDocument(
  html: string,
  mediaPaths: string[],
): ArticlePublishDocument {
  const allowedPaths = new Set(mediaPaths);
  const imagePaths = new Set<string>();
  const attr = (node: DefaultTreeAdapterTypes.Element, name: string) =>
    node.attrs.find((item) => item.name === name)?.value || '';
  const text = (node: DefaultTreeAdapterTypes.ChildNode): string =>
    '#text' === node.nodeName
      ? (node as DefaultTreeAdapterTypes.TextNode).value
      : 'childNodes' in node
        ? node.childNodes.map(text).join('')
        : '';
  const image = (
    node: DefaultTreeAdapterTypes.Element,
    caption = '',
  ): ArticlePublishNode => {
    let path = attr(node, 'data-local-path');
    if (!path && attr(node, 'src').startsWith('file:')) {
      path = fileURLToPath(attr(node, 'src'));
    }
    if (!isAbsolute(path) || !allowedPaths.has(path)) {
      throw new Error('article_image_unresolved');
    }
    imagePaths.add(path);
    return { kind: 'image', localPath: path, alt: attr(node, 'alt'), caption };
  };
  const visit = (
    node: DefaultTreeAdapterTypes.ChildNode,
  ): ArticlePublishNode[] => {
    if (node.nodeName === '#text') {
      return [
        {
          kind: 'text',
          text: (node as DefaultTreeAdapterTypes.TextNode).value,
        },
      ];
    }
    if (!('tagName' in node)) {
      return [];
    }
    if (
      ['script', 'style', 'iframe', 'object', 'svg', 'template'].includes(
        node.tagName,
      )
    ) {
      return [];
    }
    if (node.tagName === 'img') {
      return [image(node)];
    }
    if (
      node.tagName === 'figure' &&
      node.attrs.some((item) => item.name === 'data-article-image')
    ) {
      const img = node.childNodes.find(
        (child) => 'tagName' in child && child.tagName === 'img',
      ) as DefaultTreeAdapterTypes.Element | undefined;
      const caption = node.childNodes.find(
        (child) => 'tagName' in child && child.tagName === 'figcaption',
      );
      if (!img) {
        throw new Error('article_image_unresolved');
      }
      return [image(img, caption ? text(caption) : '')];
    }
    const children = node.childNodes.flatMap(visit);
    const tag =
      (
        { b: 'strong', i: 'em', div: 'p', figcaption: 'p' } as Record<
          string,
          string
        >
      )[node.tagName] || node.tagName;
    if (!TEXT_TAGS.includes(tag as ArticleTag)) {
      return children;
    }
    const href =
      node.tagName === 'a' && /^https?:\/\//i.test(attr(node, 'href'))
        ? attr(node, 'href')
        : undefined;
    return [
      {
        kind: 'element',
        tag: tag as ArticleTag,
        ...(href ? { href } : {}),
        children,
      },
    ];
  };
  const nodes = parseFragment(html).childNodes.flatMap(visit);
  return { nodes, imagePaths: [...imagePaths] };
}

export interface ArticleHtmlFormat {
  /** 必须来自实际平台适配器；没有已验证格式时不得提交。 */
  acceptedTags: readonly ArticleTag[];
  /** 参数已进行 HTML 转义，返回的标记仍检查平台标签与图片地址。 */
  renderImage: (uploadedUrl: string, alt: string, caption: string) => string;
}

/** 上传全部图片后才允许生成出站正文；转换由各平台明确提供。 */
export function renderArticleForPlatform(
  document: ArticlePublishDocument,
  uploadedImages: ReadonlyMap<string, string>,
  format: ArticleHtmlFormat,
): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const render = (node: ArticlePublishNode): string => {
    if (node.kind === 'text') {
      return escape(node.text);
    }
    if (node.kind === 'image') {
      const url = uploadedImages.get(node.localPath);
      if (!url || !/^https:\/\//i.test(url)) {
        throw new Error('article_image_not_uploaded');
      }
      return format.renderImage(
        escape(url),
        escape(node.alt),
        escape(node.caption),
      );
    }
    if (!format.acceptedTags.includes(node.tag)) {
      throw new Error('article_format_unsupported');
    }
    if (node.tag === 'br' || node.tag === 'hr') {
      return `<${node.tag}>`;
    }
    return `<${node.tag}${node.href ? ` href="${escape(node.href)}"` : ''}>${node.children.map(render).join('')}</${node.tag}>`;
  };
  const html = document.nodes.map(render).join('');
  const uploadedUrls = new Set(uploadedImages.values());
  const validate = (node: DefaultTreeAdapterTypes.ChildNode) => {
    if (!('tagName' in node)) {
      return;
    }
    if (
      node.tagName !== 'img' &&
      !format.acceptedTags.includes(node.tagName as ArticleTag)
    ) {
      throw new Error('article_format_unsupported');
    }
    for (const attr of node.attrs) {
      if (
        attr.name.startsWith('data-') ||
        attr.name.startsWith('on') ||
        attr.name === 'contenteditable' ||
        /^(file:|data:|blob:|javascript:)/i.test(attr.value.trim())
      ) {
        throw new Error('article_format_unsupported');
      }
    }
    if (
      node.tagName === 'img' &&
      !uploadedUrls.has(
        node.attrs.find((attr) => attr.name === 'src')?.value || '',
      )
    ) {
      throw new Error('article_image_not_uploaded');
    }
    node.childNodes.forEach(validate);
  };
  parseFragment(html).childNodes.forEach(validate);
  return html;
}
