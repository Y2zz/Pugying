import { formatArticleBodyForPlatform } from './article-body-format';

describe('article body format', () => {
  const body =
    '<h3>小标题</h3><p style="text-align: center"><span style="color: #b91c1c; background-color: rgb(254, 240, 138); font-size: 18px">内容</span><s>删除线</s></p><hr><img src="file:///tmp/image.png" data-local-path="/tmp/image.png">';
  it('simplifies Douyin formatting without dropping article text or image paths', () => {
    const output = formatArticleBodyForPlatform(body, 'douyin');
    expect(output).toContain('<h2>小标题</h2>');
    expect(output).toContain('删除线');
    expect(output).toContain('data-local-path="/tmp/image.png"');
    expect(output).not.toMatch(/style=|<s>|<hr>/);
  });
  it('keeps Toutiao strikethrough and separators but simplifies unverified styles', () => {
    const output = formatArticleBodyForPlatform(body, 'toutiao');
    expect(output).toContain('<s>删除线</s>');
    expect(output).toContain('<hr>');
    expect(output).not.toContain('style=');
  });
  it('keeps Bilibili presets and removes unsafe or unrestricted styles', () => {
    const output = formatArticleBodyForPlatform(body + '<span style="position:fixed;color:purple">尾文</span><script>bad()</script>', 'bilibili');
    expect(output).toContain('color: #b91c1c');
    expect(output).toContain('font-size: 18px');
    expect(output).toContain('text-align: center');
    expect(output).not.toMatch(/position|purple|script|bad\(\)/);
    expect(output).toContain('尾文');
  });
});
