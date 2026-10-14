// @vitest-environment jsdom
import {
  cleanArticlePaste,
  normalizeArticleLink,
} from './article-editor-paste';

it('keeps basic document structure and Word text emphasis while dropping decoration', () => {
  const cleaned = cleanArticlePaste(
    '<h1 class="title">标题</h1><p style="color:red"><span style="font-weight:700;font-style:italic;text-decoration:underline">强调</span></p><ul><li>条目</li></ul><blockquote>引用</blockquote><a href="https://example.com" onclick="alert(1)">链接</a>',
  );
  expect(cleaned.html).toContain('<h2>标题</h2>');
  expect(cleaned.html).toContain('<u><em><strong>强调</strong></em></u>');
  expect(cleaned.html).toContain('<ul><li>条目</li></ul>');
  expect(cleaned.html).not.toMatch(/style=|class=|onclick=/);
});

it('keeps local images and captions but removes embedded objects and unsafe links', () => {
  const cleaned = cleanArticlePaste(
    '<figure data-article-image><img src="file:///tmp/image.png" data-local-path="/tmp/image.png"><figcaption>说明</figcaption></figure><script>bad()</script><a href="javascript:alert(1)">文字</a><img src="data:image/png;base64,abc">',
  );
  expect(cleaned.html).toContain('data-local-path="/tmp/image.png"');
  expect(cleaned.html).toContain('<figcaption>说明</figcaption>');
  expect(cleaned.html).toContain('文字');
  expect(cleaned.html).not.toMatch(/javascript|script|base64|bad\(\)/);
  expect(cleaned.simplified).toBe(true);
});

it('preserves text from unsupported tables and code as ordinary content', () => {
  const cleaned = cleanArticlePaste(
    '<table><tr><td>甲</td><td>乙</td></tr></table><pre><code>示例代码</code></pre>',
  );
  expect(cleaned.html).toBe('<p>甲</p><p>乙</p><p>示例代码</p>');
  expect(cleaned.simplified).toBe(true);
});

it('accepts web addresses only and normalizes a missing protocol', () => {
  expect(normalizeArticleLink('example.com/a')).toBe('https://example.com/a');
  for (const value of [
    '',
    'javascript:alert(1)',
    'file:///tmp/file',
    'data:text/html,abc',
    'bad address',
  ]) {
    expect(normalizeArticleLink(value)).toBeNull();
  }
});
