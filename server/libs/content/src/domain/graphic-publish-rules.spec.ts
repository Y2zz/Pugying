import { graphicPublishIssue } from './graphic-publish-rules';
const base = {
  platform: 'xiaohongshu',
  title: '桌上留一点绿',
  body: '留一点空，放一本书。',
  imageCount: 2,
  tags: [],
  visibility: 'private',
  authorDeclaration: 'ai_generated' as const,
};
it('allows a private Xiaohongshu note without a separate cover', () => {
  expect(graphicPublishIssue(base)).toBeNull();
});
it('enforces platform image limits and visibility', () => {
  expect(graphicPublishIssue({ ...base, imageCount: 19 })).toContain('18');
  expect(graphicPublishIssue({ ...base, platform: 'toutiao' })).toContain('公开');
  expect(graphicPublishIssue({ ...base, platform: 'toutiao', visibility: 'public' })).toBeNull();
});
it('counts the title in the micro post caption', () => {
  expect(graphicPublishIssue({ ...base, platform: 'toutiao', visibility: 'public', title: '字'.repeat(100), body: '字'.repeat(1950) })).toContain('2000');
});
it('rejects a schedule the platform cannot apply', () => {
  expect(graphicPublishIssue({ ...base, platform: 'toutiao', visibility: 'public', scheduledAt: '2027-01-01' })).toContain('定时');
  expect(graphicPublishIssue({ ...base, scheduledAt: 'bad' })).toContain('发布时间');
});
it('validates caption plus tags on Douyin', () => {
  expect(graphicPublishIssue({ ...base, platform: 'douyin', body: '字'.repeat(999), tags: ['日常'] })).toContain('1000');
});
