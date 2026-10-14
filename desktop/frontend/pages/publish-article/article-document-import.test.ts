// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { importArticleDocument } from './article-document-import';

const file = (name: string, text: string) =>
  ({ name, size: text.length, text: async () => text }) as File;

it('imports Markdown as basic editable structure without supporting tables or code', async () => {
  const result = await importArticleDocument(
    file(
      'article.md',
      '# 标题\n\n**重点**\n\n- 条目\n\n```js\nconst a = 1;\n```',
    ),
    '',
    vi.fn(),
  );
  expect(result.html).toContain('<h2>标题</h2>');
  expect(result.html).toContain('<strong>重点</strong>');
  expect(result.html).toContain('<ul>');
  expect(result.html).not.toMatch(/<pre|<code/);
  expect(result.simplified).toBe(true);
});

it('resolves relative HTML images against the selected local document', async () => {
  const result = await importArticleDocument(
    file(
      'article.html',
      '<p>正文</p><img src="images/a%20b.png"><a href="javascript:bad()">链接</a>',
    ),
    '/tmp/docs/article.html',
    vi.fn(),
  );
  expect(result.html).toContain('data-local-path="/tmp/docs/images/a b.png"');
  expect(result.html).not.toContain('javascript:');
});

it('imports a real DOCX and materializes embedded images as local paths', async () => {
  const bytes = await readFile('test/fixtures/article-import.docx');
  const input = {
    name: 'article.docx',
    size: bytes.length,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as File;
  const save = vi.fn().mockResolvedValue('/tmp/imported.png');
  const result = await importArticleDocument(input, '/tmp/article.docx', save);
  expect(result.html).toContain('<strong>导入正文</strong>');
  expect(result.html).toContain('data-local-path="/tmp/imported.png"');
  expect(result.html).not.toContain('base64');
  expect(save).toHaveBeenCalledWith(
    expect.stringContaining('data:image/png;base64,'),
    '/tmp/article.docx',
  );
});

it('does not return partially imported HTML when an embedded image cannot be saved', async () => {
  await expect(
    importArticleDocument(
      file('article.html', '<p>正文</p><img src="data:image/png;base64,abc">'),
      '/tmp/article.html',
      vi.fn().mockResolvedValue(null),
    ),
  ).rejects.toThrow('文档尚未导入');
});
