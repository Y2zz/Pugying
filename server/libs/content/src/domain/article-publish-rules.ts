import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type { ArticleAccountSettings } from './article-settings';

type Node = DefaultTreeAdapterMap['node'];
function collectText(node: Node): string {
  if (node.nodeName === '#text') {
    return (node as DefaultTreeAdapterMap['textNode']).value;
  }
  if (['script', 'style'].includes(node.nodeName)) {
    return '';
  }
  if ('childNodes' in node) {
    return node.childNodes.map(collectText).join('');
  }
  return '';
}

export function articlePublishIssue(
  input: {
    platform: string;
    title: string;
    body: string;
    tags: string[];
    visibility: string;
    scheduledAt?: string;
    settings?: ArticleAccountSettings;
  },
  now = Date.now(),
): string | null {
  const { platform, title, body, tags, visibility, scheduledAt, settings } = input;
  const titleLength = Array.from(title.replace(/\s+/g, ' ').trim()).length;
  const titleMax = platform === 'bilibili' ? 40 : 30;
  if (!titleLength) {
    return '标题不能为空';
  }
  if (titleLength > titleMax) {
    return `标题最多 ${titleMax} 字`;
  }
  if (platform === 'toutiao' && titleLength < 2) {
    return '头条标题至少 2 字';
  }
  const fragment = parseFragment(body);
  const textLength = Array.from(collectText(fragment).replace(/\s/g, '')).length;
  if (!textLength) {
    return '正文不能为空';
  }
  const bodyMax = platform === 'douyin' ? 20_000 : platform === 'bilibili' ? 100_000 : null;
  if (bodyMax && textLength > bodyMax) {
    return `正文最多 ${bodyMax.toLocaleString('zh-CN')} 字`;
  }
  if (platform === 'douyin') {
    if (Array.from(settings?.summary?.trim() ?? '').length > 30) {
      return '文章摘要最多 30 字';
    }
    if (tags.length > 5) {
      return '最多添加 5 个话题';
    }
    let images = 0;
    const countImages = (node: Node): void => {
      if (node.nodeName === 'img') {
        images += 1;
      }
      if ('childNodes' in node) {
        node.childNodes.forEach(countImages);
      }
    };
    countImages(fragment);
    if (images > 30) {
      return '正文最多添加 30 张图片';
    }
  }
  const visibilityOptions = platform === 'douyin' ? ['public', 'friends', 'private'] : ['public', 'private'];
  if (platform !== 'toutiao' && !visibilityOptions.includes(visibility)) {
    return '请选择该平台支持的可见范围';
  }
  if (scheduledAt) {
    const time = new Date(scheduledAt).getTime();
    if (!Number.isFinite(time)) {
      return '发布时间无效';
    }
    const minHours = platform === 'toutiao' ? 0 : 2;
    const maxDays = platform === 'douyin' ? 14 : platform === 'bilibili' ? 7 : null;
    if (time <= now || time < now + minHours * 3_600_000) {
      return minHours ? `发布时间需在 ${minHours} 小时之后` : '发布时间需晚于当前时间';
    }
    if (maxDays && time > now + maxDays * 86_400_000) {
      return `发布时间不能晚于 ${maxDays} 天后`;
    }
  }
  return null;
}
