import type {
  ArticlePublishDocument,
  ArticlePublishNode,
} from '../article-publish-format';
import {
  ArticleApiError,
  assertArticleActive,
  type ArticleApiSession,
  type UploadedArticleImage,
} from './article-api';

export function articleText(nodes: ArticlePublishNode[]): string {
  return nodes
    .map((node) =>
      node.kind === 'text'
        ? node.text
        : node.kind === 'image'
          ? ''
          : articleText(node.children),
    )
    .join('');
}

export function articleSchedule(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= Date.now()) {
    throw new ArticleApiError('invalid_payload', '请重新设置发布时间');
  }
  return Math.floor(time / 1000);
}

export async function uploadArticleImages(
  api: ArticleApiSession,
  paths: string[],
  signal: { cancelled: boolean },
): Promise<Map<string, UploadedArticleImage>> {
  const images = new Map<string, UploadedArticleImage>();
  for (const path of new Set(paths)) {
    assertArticleActive(signal);
    images.set(path, await api.uploadImage(path));
  }
  return images;
}

export function uploadedImage(
  images: ReadonlyMap<string, UploadedArticleImage>,
  path: string,
): UploadedArticleImage {
  const image = images.get(path);
  if (!image) {
    throw new ArticleApiError(
      'MEDIA_MISSING',
      '找不到文章图片或封面，请重新选择',
    );
  }
  return image;
}

/** 抖音当前 long_article 使用 Markdown，图片引用上传 URI。 */
export function douyinArticleMarkdown(
  document: ArticlePublishDocument,
  images: ReadonlyMap<string, UploadedArticleImage>,
): string {
  const escape = (value: string) =>
    value.replace(/([\\`*_{}\[\]()#+.!<>~])/g, '\\$1');
  const render = (node: ArticlePublishNode): string => {
    if (node.kind === 'text') {
      return escape(node.text);
    }
    if (node.kind === 'image') {
      const image = uploadedImage(images, node.localPath);
      return `![${escape(node.alt)}](${image.uri}${node.caption ? ` "${node.caption.replace(/["\\]/g, '\\$&').replace(/\n/g, ' ')}"` : ''})\n\n`;
    }
    const body = node.children.map(render).join('');
    switch (node.tag) {
      case 'p':
        return `${body}\n\n`;
      case 'h2':
        return `## ${body}\n\n`;
      case 'strong':
        return `**${body}**`;
      case 'em':
        return `*${body}*`;
      case 's':
        return `~~${body}~~`;
      case 'u':
        return `<u>${body}</u>`;
      case 'br':
        return '  \n';
      case 'hr':
        return '\n---\n\n';
      case 'blockquote':
        return `${body
          .trimEnd()
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')}\n\n`;
      case 'a':
        return node.href
          ? `[${body}](${node.href.replace(/[()\s]/g, (char) => encodeURIComponent(char))})`
          : body;
      case 'pre': {
        const code = articleText(node.children);
        const fence = '`'.repeat(
          Math.max(
            3,
            ...[...code.matchAll(/`+/g)].map((match) => match[0].length + 1),
          ),
        );
        return `${fence}\n${code}\n${fence}\n\n`;
      }
      case 'code': {
        const code = articleText(node.children);
        const fence = '`'.repeat(
          Math.max(
            1,
            ...[...code.matchAll(/`+/g)].map((match) => match[0].length + 1),
          ),
        );
        return `${fence} ${code} ${fence}`;
      }
      case 'ul':
      case 'ol':
        return `${node.children.map((child, index) => `${node.tag === 'ol' ? `${index + 1}.` : '-'} ${render(child).trim().replace(/\n/g, '\n  ')}`).join('\n')}\n\n`;
      case 'li':
        return body;
    }
  };
  return document.nodes.map(render).join('').trim();
}

/** B 站新版专栏的 opus 正文协议；标题、代码、列表和引用均有独立段落类型。 */
export function bilibiliArticleParagraphs(
  document: ArticlePublishDocument,
  images: ReadonlyMap<string, UploadedArticleImage>,
): Record<string, unknown>[] {
  const inline = (
    nodes: ArticlePublishNode[],
    style: Record<string, boolean> = {},
    heading = false,
  ): Record<string, unknown>[] =>
    nodes.flatMap((node) => {
      if (node.kind === 'image') {
        throw new ArticleApiError(
          'ARTICLE_FORMAT_UNSUPPORTED',
          '请将文章图片放在独立段落中',
        );
      }
      if (node.kind === 'text' || node.tag === 'br') {
        return [
          {
            node_type: 1,
            word: {
              words: node.kind === 'text' ? node.text : '\n',
              font_size: heading ? 22 : 17,
              font_level: heading ? 'xLarge' : 'regular',
              color: '',
              dark_color: '',
              style,
            },
          },
        ];
      }
      if (node.tag === 'a' && node.href) {
        return [
          {
            node_type: 4,
            link: {
              link_type: 16,
              link: node.href,
              show_text: articleText(node.children),
              biz_id: '',
              icon: '',
              icon_suffix: '',
              pics: [],
              style: { ...style, font_size: 17, font_level: 'regular' },
            },
          },
        ];
      }
      const mark = (
        {
          strong: 'bold',
          em: 'italic',
          s: 'strikethrough',
          u: 'underline',
        } as Record<string, string>
      )[node.tag];
      return inline(
        node.children,
        mark ? { ...style, [mark]: true } : style,
        heading,
      );
    });
  const paragraph = (
    nodes: ArticlePublishNode[],
    type = 1,
    format: Record<string, unknown> = {},
  ) => ({
    para_type: type,
    format: { align: 0, ...format },
    text: { nodes: inline(nodes, {}, type === 9) },
  });
  const blocks = (
    nodes: ArticlePublishNode[],
    listLevel = 1,
  ): Record<string, unknown>[] =>
    nodes.flatMap((node) => {
      if (node.kind === 'image') {
        const image = uploadedImage(images, node.localPath);
        return [
          {
            para_type: 2,
            pic: {
              pics: [
                {
                  url: image.url,
                  width: image.width,
                  height: image.height,
                  size: image.size,
                  comment: node.caption,
                },
              ],
              style: 0,
            },
          },
        ];
      }
      if (node.kind === 'text') {
        return node.text.trim() ? [paragraph([node])] : [];
      }
      if (node.tag === 'hr') {
        return [{ para_type: 3, line: { line_type: 1 } }];
      }
      if (node.tag === 'pre') {
        return [
          {
            para_type: 8,
            code: { lang: '', content: articleText(node.children) },
          },
        ];
      }
      if (node.tag === 'ul' || node.tag === 'ol') {
        return node.children.flatMap((item, index) => {
          const children =
            item.kind === 'element' && item.tag === 'li'
              ? item.children
              : [item];
          const nested = children.filter(
            (child) =>
              child.kind === 'element' && ['ul', 'ol'].includes(child.tag),
          );
          const ordinary = children.filter((child) => !nested.includes(child));
          return [
            paragraph(ordinary, node.tag === 'ol' ? 5 : 6, {
              list_format: {
                level: listLevel,
                order: index + 1,
                theme: node.tag === 'ol' ? 'arabic_num' : 'dot',
              },
            }),
            ...blocks(nested, listLevel + 1),
          ];
        });
      }
      if (node.tag === 'blockquote') {
        return node.children.flatMap((child) =>
          child.kind === 'element' && child.tag === 'p'
            ? [paragraph(child.children, 4)]
            : [paragraph([child], 4)],
        );
      }
      // 编辑器可能将图片包含在 p 中，拆出独立图片段落并保持顺序。
      if (
        node.tag === 'p' &&
        node.children.some((child) => child.kind === 'image')
      ) {
        const result: Record<string, unknown>[] = [];
        let pending: ArticlePublishNode[] = [];
        for (const child of node.children) {
          if (child.kind === 'image') {
            if (pending.length) {
              result.push(paragraph(pending));
              pending = [];
            }
            result.push(...blocks([child]));
          } else {
            pending.push(child);
          }
        }
        if (pending.length) {
          result.push(paragraph(pending));
        }
        return result;
      }
      return [paragraph(node.children, node.tag === 'h2' ? 9 : 1)];
    });
  return blocks(document.nodes);
}
