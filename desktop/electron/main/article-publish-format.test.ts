import {
  prepareArticleDocument,
  renderArticleForPlatform,
  type ArticleHtmlFormat,
} from './article-publish-format';

const path = '/tmp/图 #1.png';
const html = `<p class="editor" contenteditable="true">前文<strong>加粗</strong></p><figure data-article-image><img src="file:///tmp/图%20%231.png" data-local-path="${path}" data-preview-data="secret"><figcaption>说明 &amp; 描述</figcaption></figure><p>后文</p>`;
const format: ArticleHtmlFormat = {
  acceptedTags: ['p', 'strong'],
  // 测试格式：真实平台必须提供各自经过验证的转换，不复用此假设。
  renderImage: (url, alt, caption) =>
    `<img src="${url}" alt="${alt}"><p>${caption}</p>`,
};

it('separates local images and captions from article formatting and removes editor attributes', () => {
  const document = prepareArticleDocument(html, [path]);
  expect(document.imagePaths).toEqual([path]);
  expect(document.nodes[1]).toEqual({
    kind: 'image',
    localPath: path,
    alt: '',
    caption: '说明 & 描述',
  });
  expect(JSON.stringify(document)).not.toMatch(
    /data-|contenteditable|secret|file:/,
  );
  const result = renderArticleForPlatform(
    document,
    new Map([[path, 'https://platform.example/upload/1']]),
    format,
  );
  expect(result).toContain('<p>前文<strong>加粗</strong></p>');
  expect(result).toContain('https://platform.example/upload/1');
  expect(result).toContain('<p>后文</p>');
  expect(result).not.toMatch(/data-|contenteditable|file:|\/tmp\//);
});

it('refuses unregistered images, missing uploads, and unsupported platform formatting', () => {
  expect(() => prepareArticleDocument(html, [])).toThrow(
    'article_image_unresolved',
  );
  expect(() =>
    prepareArticleDocument('<img src="https://unknown.example/a.png">', []),
  ).toThrow('article_image_unresolved');
  const document = prepareArticleDocument(html, [path]);
  expect(() => renderArticleForPlatform(document, new Map(), format)).toThrow(
    'article_image_not_uploaded',
  );
  expect(() =>
    renderArticleForPlatform(
      document,
      new Map([[path, 'file:///tmp/a.png']]),
      format,
    ),
  ).toThrow('article_image_not_uploaded');
  expect(() =>
    renderArticleForPlatform(
      document,
      new Map([[path, 'https://platform.example/1']]),
      { ...format, acceptedTags: ['p'] },
    ),
  ).toThrow('article_format_unsupported');
});

it('discards active content and unsafe links and escapes article text', () => {
  const document = prepareArticleDocument(
    '<script>alert(1)</script><p onclick="bad()">&lt;text&gt;<a href="javascript:bad()">链接</a></p>',
    [],
  );
  const result = renderArticleForPlatform(document, new Map(), {
    ...format,
    acceptedTags: ['p', 'a'],
  });
  expect(result).toBe('<p>&lt;text&gt;<a>链接</a></p>');
});

it('preserves legacy standalone images and their order alongside surrounding text', () => {
  const document = prepareArticleDocument(
    `<p>第一段</p><img src="file:///tmp/图%20%231.png"><p>第二段</p><img src="file:///tmp/图%20%231.png">`,
    [path],
  );
  expect(document.imagePaths).toEqual([path]);
  expect(document.nodes.map((node) => node.kind)).toEqual([
    'element',
    'image',
    'element',
    'image',
  ]);
});

it('escapes captions and rejects platform output that retains local editor markup', () => {
  const document = prepareArticleDocument(
    `<figure data-article-image><img data-local-path="${path}" src="file:///tmp/image.png"><figcaption>&lt;img onerror="bad()"&gt;</figcaption></figure>`,
    [path],
  );
  const uploaded = new Map([[path, 'https://platform.example/1']]);
  expect(renderArticleForPlatform(document, uploaded, format)).toContain(
    '&lt;img onerror=&quot;bad()&quot;&gt;',
  );
  expect(() =>
    renderArticleForPlatform(document, uploaded, {
      ...format,
      renderImage: () =>
        '<img src="file:///tmp/image.png" data-local-path="/tmp/image.png">',
    }),
  ).toThrow();
});
