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
  const {
    platform,
    title,
    body,
    imageCount,
    tags,
    visibility,
    scheduledAt,
    authorDeclaration = 'none',
  } = input;
  const toutiao = platform === 'toutiao';
  const channels = platform === 'channels';
  const douyin = platform === 'douyin';
  const xiaohongshu = platform === 'xiaohongshu';

  const titleMax = toutiao ? 100 : channels ? 30 : 20;
  const titleText = title.trim();
  if (channels) {
    if (titleText.length > titleMax) {
      return `标题最多 ${titleMax} 字`;
    }
  } else if (!titleText || titleText.length > titleMax) {
    return `标题需为 1 至 ${titleMax} 字`;
  }

  const maxImages = douyin ? 30 : 18;
  if (imageCount < 1 || imageCount > maxImages) {
    return `请选择 1 至 ${maxImages} 张图片`;
  }

  const text = toutiao
    ? `${titleText}\n\n${body.trim()}`
    : channels
      ? [titleText, body.trim()].filter(Boolean).join('\n')
      : body.trim();
  const maxBody = toutiao ? 2000 : 1000;
  if (!body.trim() || text.length > maxBody) {
    return toutiao
      ? '微头条标题与文案合计最多 2000 字'
      : channels
        ? '标题、文案与话题合计最多 1000 字'
        : '文案需为 1 至 1000 字';
  }

  // 抖音 / 视频号可用独立话题字段；其余平台须写入文案
  if (!douyin && !channels && tags.length) {
    return '该平台请将话题写入文案';
  }

  const allowedVisibility = toutiao
    ? ['public']
    : douyin
      ? ['public', 'private', 'friends']
      : ['public', 'private'];
  if (!allowedVisibility.includes(visibility)) {
    return toutiao ? '微头条仅支持公开发布' : '请重新选择可见范围';
  }

  const declarations = channels
    ? ['none']
    : xiaohongshu
      ? ['none', 'ai_generated', 'marketing', 'reposted', 'fictional']
      : [
          'none',
          'ai_generated',
          'personal_opinion',
          'reposted',
          'fictional',
          ...(douyin ? ['marketing'] : []),
        ];
  if (!declarations.includes(authorDeclaration)) {
    return '请重新选择自主声明';
  }

  if (scheduledAt) {
    if (toutiao || channels) {
      return channels ? '视频号图文暂不支持定时发布' : '微头条暂不支持定时发布';
    }
    const time = new Date(scheduledAt).getTime();
    const hours = douyin ? 2 : 1;
    if (
      !Number.isFinite(time) ||
      time < now + hours * 3600000 ||
      time > now + 14 * 86400000
    ) {
      return '请重新设置发布时间';
    }
  }

  if (douyin) {
    const existing = new Set<string>(body.match(/#[^\s#]+/g) ?? []);
    const additions = [
      ...new Set(
        tags
          .map((tag) => tag.trim().replace(/^#+/, ''))
          .filter(Boolean),
      ),
    ]
      .map((tag) => `#${tag}`)
      .filter((tag) => !existing.has(tag));
    if (
      tags.length > 5 ||
      [body.trim(), additions.join(' ')].filter(Boolean).join('\n').length >
        1000
    ) {
      return '文案与话题合计最多 1000 字，话题最多 5 个';
    }
  }

  if (channels) {
    const topicSuffix = [
      ...new Set(
        tags
          .map((tag) => tag.trim().replace(/^#+/, ''))
          .filter(Boolean),
      ),
    ]
      .map((tag) => `#${tag}`)
      .join(' ');
    const description = [text, topicSuffix]
      .filter(Boolean)
      .join(text && topicSuffix ? ' ' : '');
    if (tags.length > 10 || description.length > 1000) {
      return '标题、文案与话题合计最多 1000 字，话题最多 10 个';
    }
  }

  return null;
}
