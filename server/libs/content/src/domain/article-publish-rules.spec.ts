import { articlePublishIssue } from './article-publish-rules';

const now = Date.UTC(2026, 9, 5);
const valid = { platform: 'douyin', title: '文章标题', body: '<p>正文</p>', tags: [], visibility: 'public' };
describe('article publish rules', () => {
  it('counts decoded text and Unicode characters rather than HTML markup', () => {
    expect(articlePublishIssue({ ...valid, body: '<p>' + '&#x1f600;'.repeat(20_000) + '</p>' }, now)).toBeNull();
    expect(articlePublishIssue({ ...valid, body: '<p>' + '&#x1f600;'.repeat(20_001) + '</p>' }, now)).toContain('20,000');
    expect(articlePublishIssue({ ...valid, body: '<p>&nbsp;</p><img src="x"><script>文字</script>' }, now)).toBe('正文不能为空');
  });
  it.each([
    { title: '字'.repeat(31) },
    { settings: { summary: '😀'.repeat(31) } },
    { tags: ['1', '2', '3', '4', '5', '6'] },
    { visibility: 'unsupported' },
    { body: '<p>正文</p>' + '<img src="x">'.repeat(31) },
    { scheduledAt: new Date(now + 3_600_000).toISOString() },
    { scheduledAt: new Date(now + 15 * 86_400_000).toISOString() },
    { scheduledAt: 'invalid' },
  ])('rejects invalid effective account fields: %j', (overrides) => {
    expect(articlePublishIssue({ ...valid, ...overrides }, now)).not.toBeNull();
  });
  it('uses verified Bilibili window and permits Toutiao future times without inventing its window', () => {
    expect(articlePublishIssue({ ...valid, platform: 'bilibili', scheduledAt: new Date(now + 8 * 86_400_000).toISOString() }, now)).toContain('7 天');
    expect(articlePublishIssue({ ...valid, platform: 'toutiao', scheduledAt: new Date(now + 3_600_000).toISOString() }, now)).toBeNull();
    expect(articlePublishIssue({ ...valid, platform: 'toutiao', title: '字' }, now)).toBe('头条标题至少 2 字');
  });
});
