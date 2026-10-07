import type { AuthorDeclaration } from './author-declaration';

/** 当前已接入平台的图文发布规则；草稿保存不受发布要求限制。 */
export function graphicPublishIssue(
  input: {
    platform: string;
    title: string;
    body: string;
    imageCount: number;
    tags: string[];
    visibility: string;
    scheduledAt?: string;
    authorDeclaration?: AuthorDeclaration;
  },
  now = Date.now(),
): string | null {
  const { platform, title, body, imageCount, tags, visibility, scheduledAt, authorDeclaration = 'none' } = input;
  const toutiao = platform === 'toutiao';
  const titleMax = toutiao ? 100 : 20;
  if (!title.trim() || title.trim().length > titleMax) {
    return `标题需为 1 至 ${titleMax} 字`;
  }
  const maxImages = platform === 'douyin' ? 30 : 18;
  if (imageCount < 1 || imageCount > maxImages) {
    return `请选择 1 至 ${maxImages} 张图片`;
  }
  const text = toutiao ? `${title.trim()}\n\n${body.trim()}` : body.trim();
  const maxBody = toutiao ? 2000 : 1000;
  if (!body.trim() || text.length > maxBody) {
    return toutiao ? '微头条标题与文案合计最多 2000 字' : '文案需为 1 至 1000 字';
  }
  if (platform !== 'douyin' && tags.length) {
    return '该平台请将话题写入文案';
  }
  const allowedVisibility = toutiao ? ['public'] : platform === 'douyin' ? ['public', 'private', 'friends'] : ['public', 'private'];
  if (!allowedVisibility.includes(visibility)) {
    return toutiao ? '微头条仅支持公开发布' : '请重新选择可见范围';
  }
  const declarations =
    platform === 'xiaohongshu'
      ? ['none', 'ai_generated', 'marketing', 'reposted', 'fictional']
      : ['none', 'ai_generated', 'personal_opinion', 'reposted', 'fictional', ...(platform === 'douyin' ? ['marketing'] : [])];
  if (!declarations.includes(authorDeclaration)) {
    return '请重新选择自主声明';
  }
  if (scheduledAt) {
    if (toutiao) {
      return '微头条暂不支持定时发布';
    }
    const time = new Date(scheduledAt).getTime();
    const hours = platform === 'douyin' ? 2 : 1;
    if (!Number.isFinite(time) || time < now + hours * 3600000 || time > now + 14 * 86400000) {
      return '请重新设置发布时间';
    }
  }
  if (platform === 'douyin') {
    const existing = new Set<string>(body.match(/#[^\s#]+/g) ?? []);
    const additions = [...new Set(tags.map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean))]
      .map((tag) => `#${tag}`)
      .filter((tag) => !existing.has(tag));
    if (tags.length > 5 || [body.trim(), additions.join(' ')].filter(Boolean).join('\n').length > 1000) {
      return '文案与话题合计最多 1000 字，话题最多 5 个';
    }
  }
  return null;
}
