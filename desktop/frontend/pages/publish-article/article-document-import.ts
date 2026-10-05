import { cleanArticlePaste } from './article-editor-paste';

export class ArticleDocumentImportError extends Error {}

export async function articleImageToPng(source: string): Promise<string> {
  if (source.startsWith('data:image/png;base64,')) {
    return source;
  }
  const image = new Image();
  image.src = source;
  await image.decode();
  if (
    !image.naturalWidth ||
    !image.naturalHeight ||
    image.naturalWidth * image.naturalHeight > 40_000_000
  ) {
    throw new ArticleDocumentImportError('图片尺寸过大，请单独插入');
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ArticleDocumentImportError('图片读取失败');
  }
  context.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function importArticleDocument(
  file: File,
  sourcePath: string,
  saveImage: (data: string, sourcePath: string) => Promise<string | null>,
): Promise<{ html: string; simplified: boolean }> {
  if (file.size > 20 * 1024 * 1024) {
    throw new ArticleDocumentImportError('文档过大，请选择小于 20 MB 的文件');
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  let html: string;
  let warnings = false;
  if (extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        styleMap: ['u => u', 'strike => s'],
      },
    );
    html = result.value;
    warnings = result.messages.length > 0;
  } else if (extension === 'md' || extension === 'markdown') {
    const { marked } = await import('marked');
    html = await marked.parse(await file.text(), { async: false });
  } else if (extension === 'html' || extension === 'htm') {
    html = await file.text();
  } else if (extension === 'txt') {
    const document = window.document.implementation.createHTMLDocument();
    for (const line of (await file.text()).split(/\r?\n/)) {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      document.body.appendChild(paragraph);
    }
    html = document.body.innerHTML;
  } else {
    throw new ArticleDocumentImportError(
      '请选择 Markdown、HTML、TXT 或 DOCX 文档',
    );
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const image of Array.from(document.body.querySelectorAll('img'))) {
    const src = image.getAttribute('src') || '';
    if (/^data:image\//i.test(src)) {
      const path = await saveImage(await articleImageToPng(src), sourcePath);
      if (!path) {
        throw new ArticleDocumentImportError('图片未保存，文档尚未导入');
      }
      const url = path.replace(/\\/g, '/');
      image.src = `file://${url.startsWith('/') ? '' : '/'}${url.split('/').map(encodeURIComponent).join('/')}`;
      image.setAttribute('data-local-path', path);
    } else if (!/^[a-z][a-z\d+.-]*:/i.test(src) && sourcePath) {
      const source = sourcePath.replace(/\\/g, '/');
      const base = `file://${source.startsWith('/') ? '' : '/'}${source.split('/').map(encodeURIComponent).join('/')}`;
      const resolved = new URL(src, base);
      if (resolved.protocol === 'file:') {
        const path = decodeURIComponent(resolved.pathname).replace(
          /^\/([a-z]:\/)/i,
          '$1',
        );
        image.src = resolved.href;
        image.setAttribute('data-local-path', path);
      }
    }
  }
  const cleaned = cleanArticlePaste(document.body.innerHTML, true);
  return { html: cleaned.html, simplified: cleaned.simplified || warnings };
}
