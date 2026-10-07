import type { AuthorDeclaration } from './author-declaration';

/** 发布前按目标平台检查；草稿保存允许保留未完善设置。 */
export function videoPublishIssue(
  input: {
    platform: string;
    title: string;
    body: string;
    videoCount: number;
    tags: string[];
    visibility: string;
    scheduledAt?: string;
    authorDeclaration?: AuthorDeclaration;
    bilibiliVideoSettings?: import('./bilibili-video-settings').BilibiliVideoSettings;
  },
  now = Date.now(),
): string | null {
  if (input.platform === 'bilibili') {
    const settings = input.bilibiliVideoSettings;
    if (!input.title.trim() || input.title.trim().length > 30 || input.body.trim().length > 1000 || input.videoCount !== 1) {
      return '请检查标题、简介和视频';
    }
    if (!['public', 'private'].includes(input.visibility)) {
      return '请重新选择可见范围';
    }
    if (!settings || !Number.isSafeInteger(settings.partitionId) || settings.partitionId <= 0) {
      return '请选择视频分区';
    }
    if (![1, 2].includes(settings.copyright) || (settings.copyright === 2 && !settings.source?.trim())) {
      return '请填写转载来源';
    }
    if (input.tags.length < 1 || input.tags.length > 10 || input.tags.some((tag) => !tag.trim() || tag.includes(','))) {
      return '请添加 1 至 10 个标签';
    }
    if ((input.authorDeclaration ?? 'none') !== 'none' && !settings.creationStatementId) {
      return '请重新选择创作声明';
    }
    if (input.scheduledAt && (!Number.isFinite(new Date(input.scheduledAt).getTime()) || new Date(input.scheduledAt).getTime() <= now)) {
      return '请重新设置发布时间';
    }
    return null;
  }
  const toutiao = input.platform === 'toutiao';
  const xiaohongshu = input.platform === 'xiaohongshu';
  const titleMax = xiaohongshu ? 20 : 30;
  if (!input.title.trim() || input.title.trim().length > titleMax) {
    return `标题需为 1 至 ${titleMax} 字`;
  }
  if (input.videoCount !== 1) {
    return '请选择一个视频';
  }
  if (input.body.trim().length > 1000) {
    return '简介最多 1000 字';
  }
  if (!(xiaohongshu || toutiao ? ['public', 'private'] : ['public', 'private', 'friends']).includes(input.visibility)) {
    return '请重新选择可见范围';
  }
  if ((xiaohongshu || toutiao) && input.tags.length) {
    return '该平台请将话题写入简介';
  }
  const declarations = ['none', 'ai_generated', 'fictional', 'marketing', 'reposted', ...(xiaohongshu ? [] : ['personal_opinion'])];
  if (!declarations.includes(input.authorDeclaration ?? 'none') || (toutiao && input.authorDeclaration === 'marketing')) {
    return '请重新选择自主声明';
  }
  if (!xiaohongshu && !toutiao) {
    const existing = new Set(input.body.match(/#[^\s#]+/g) ?? []);
    const additions = [...new Set(input.tags.map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean))]
      .map((tag) => `#${tag}`)
      .filter((tag) => !existing.has(tag));
    if (input.tags.length > 5 || [input.body.trim(), additions.join(' ')].filter(Boolean).join('\n').length > 1000) {
      return '简介与话题合计最多 1000 字，话题最多 5 个';
    }
  }
  if (input.scheduledAt) {
    const time = new Date(input.scheduledAt).getTime();
    if (!Number.isFinite(time) || (toutiao ? time <= now : time < now + (xiaohongshu ? 1 : 2) * 3600000 || time > now + 14 * 86400000)) {
      return '请重新设置发布时间';
    }
  }
  return null;
}
