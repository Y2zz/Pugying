import { videoPublishIssue } from './video-publish-rules';

const valid = { platform: 'xiaohongshu', title: '桌面留一点空', body: '', videoCount: 1, tags: [], visibility: 'private' };
const now = Date.UTC(2026, 9, 7);

it('accepts a private video with an optional description and one-hour scheduling', () => {
  expect(videoPublishIssue({ ...valid, scheduledAt: new Date(now + 3600000).toISOString(), authorDeclaration: 'ai_generated' }, now)).toBeNull();
});

it.each([
  { title: '字'.repeat(21) },
  { body: '字'.repeat(1001) },
  { visibility: 'friends' },
  { tags: ['日常'] },
  { videoCount: 2 },
  { scheduledAt: new Date(now + 3599999).toISOString() },
  { authorDeclaration: 'personal_opinion' as const },
])('rejects incompatible Xiaohongshu settings %j', (patch) => {
  expect(videoPublishIssue({ ...valid, ...patch }, now)).not.toBeNull();
});

it('keeps Douyin title, friends visibility and two-hour schedule rules', () => {
  const douyin = {
    ...valid,
    platform: 'douyin',
    title: '字'.repeat(30),
    visibility: 'friends',
    tags: ['日常'],
    scheduledAt: new Date(now + 7200000).toISOString(),
  };
  expect(videoPublishIssue(douyin, now)).toBeNull();
  expect(videoPublishIssue({ ...douyin, scheduledAt: new Date(now + 3600000).toISOString() }, now)).not.toBeNull();
});

it('uses Toutiao visibility and declaration constraints independently of Douyin', () => {
  const toutiao = { ...valid, platform: 'toutiao', authorDeclaration: 'personal_opinion' as const };
  expect(videoPublishIssue(toutiao, now)).toBeNull();
  expect(videoPublishIssue({ ...toutiao, visibility: 'friends' }, now)).not.toBeNull();
  expect(videoPublishIssue({ ...toutiao, authorDeclaration: 'marketing' }, now)).not.toBeNull();
  expect(videoPublishIssue({ ...toutiao, scheduledAt: new Date(now - 1000).toISOString() }, now)).not.toBeNull();
});

it('Bilibili requires a leaf partition, tags and a source for reprints', () => {
  const input = {
    platform: 'bilibili',
    title: 'test',
    body: '',
    videoCount: 1,
    tags: ['test'],
    visibility: 'private',
    bilibiliVideoSettings: { partitionId: 21, copyright: 1 as const },
  };
  expect(videoPublishIssue(input)).toBeNull();
  expect(videoPublishIssue({ ...input, bilibiliVideoSettings: { partitionId: 0, copyright: 1 } })).toBe('请选择视频分区');
  expect(videoPublishIssue({ ...input, bilibiliVideoSettings: { partitionId: 21, copyright: 2 } })).toBe('请填写转载来源');
  expect(videoPublishIssue({ ...input, tags: [] })).toBe('请添加 1 至 10 个标签');
  expect(videoPublishIssue({ ...input, visibility: 'friends' })).toBe('请重新选择可见范围');
});
