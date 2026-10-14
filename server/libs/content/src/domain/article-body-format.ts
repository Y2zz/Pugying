import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];

/** 保守的文章输出策略，与桌面阅读预览一致；正文原稿不修改。 */
export function formatArticleBodyForPlatform(html: string, platform: string): string {
  const document = parseFragment(html);
  const visit = (node: Node): Node[] => {
    if (!('tagName' in node)) {
      return [node];
    }
    if (['script', 'style', 'iframe', 'object'].includes(node.tagName)) {
      return [];
    }
    node.childNodes = node.childNodes.flatMap(visit);
    node.attrs = node.attrs.filter((attribute) => !attribute.name.startsWith('on'));
    if (platform !== 'bilibili') {
      node.attrs = node.attrs.filter((attribute) => attribute.name !== 'style');
      if (node.tagName === 'h3') {
        node.tagName = node.nodeName = 'h2';
      }
    } else {
      for (const attribute of node.attrs.filter((item) => item.name === 'style')) {
        attribute.value = allowedStyles(attribute.value, node);
      }
      node.attrs = node.attrs.filter((attribute) => attribute.name !== 'style' || attribute.value);
    }
    if (platform === 'douyin' && ['s', 'del', 'strike', 'hr'].includes(node.tagName)) {
      return node.childNodes;
    }
    return [node];
  };
  document.childNodes = document.childNodes.flatMap(visit);
  return serialize(document);
}

function allowedStyles(style: string, node: Element): string {
  const colors = ['#b91c1c', '#1d4ed8', '#15803d', 'rgb(185,28,28)', 'rgb(29,78,216)', 'rgb(21,128,61)'];
  const backgrounds = ['#fef08a', '#bfdbfe', 'rgb(254,240,138)', 'rgb(191,219,254)'];
  return style
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => {
      const [property, raw] = entry.split(':');
      const value = raw?.replace(/\s/g, '').toLowerCase();
      if (property === 'text-align' && ['p', 'h2', 'h3'].includes(node.tagName)) {
        return ['left', 'center', 'right'].includes(value);
      }
      if (node.tagName !== 'span') {
        return false;
      }
      return (
        (property === 'color' && colors.includes(value)) ||
        (property === 'background-color' && backgrounds.includes(value)) ||
        (property === 'font-size' && ['16px', '18px', '20px'].includes(value))
      );
    })
    .join('; ');
}
