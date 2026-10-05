// @vitest-environment jsdom
import { articleBodyPreview } from './article-body-preview';

it('shows platform simplification while keeping the original styles for common and Bilibili previews', () => {
  const html =
    '<h3>小标题</h3><p style="text-align:center"><span style="color:#b91c1c;font-size:18px">正文</span><s>旧文字</s></p><hr>';
  const original = articleBodyPreview(html, 'common');
  const bili = articleBodyPreview(html, 'bilibili');
  expect(original.html).toContain('font-size: 18px');
  expect(bili.html).toContain('text-align: center');
  const douyin = articleBodyPreview(html, 'douyin');
  expect(douyin.html).not.toMatch(/style=|<s>|<hr>/);
  expect(douyin.html).toContain('旧文字');
  expect(douyin.simplified).toBe(true);
  const toutiao = articleBodyPreview(html, 'toutiao');
  expect(toutiao.html).toContain('<s>旧文字</s>');
  expect(toutiao.html).toContain('<hr>');
});
