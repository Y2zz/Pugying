// @vitest-environment jsdom
import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ArticleRichTextEditor,
  extractLocalImagePathsFromHtml,
} from './ArticleRichTextEditor';

const imagePath = '/tmp/正文图片.png';
const preview = 'data:image/png;base64,aW1hZ2U=';

function ControlledEditor({
  initialHtml = '<p>正文</p>',
}: {
  initialHtml?: string;
}) {
  const [value, setValue] = useState(initialHtml);
  return (
    <TooltipProvider>
      <ArticleRichTextEditor
        value={value}
        onChange={setValue}
        minLength={0}
        maxLength={50000}
      />
    </TooltipProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('pugyingDesktop', {
    available: true,
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    getPathForFile: vi.fn(() => imagePath),
    readLocalImageDataUrl: vi.fn().mockResolvedValue(preview),
  });
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('inserts a local image and restores its preview from saved HTML without embedding image bytes', async () => {
  const first = render(<ControlledEditor />);
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  act(() => {
    body.editor.commands.setTextSelection(3);
  });
  fireEvent.click(screen.getByRole('button', { name: '插入图片' }));
  const input = first.container.querySelector('input[type=file]')!;
  fireEvent.change(input, {
    target: {
      files: [new File(['image'], '正文图片.png', { type: 'image/png' })],
    },
  });

  await waitFor(() => {
    expect(first.container.querySelector('img')?.getAttribute('src')).toBe(
      preview,
    );
  });
  const savedHtml = body.editor.getHTML();
  expect(extractLocalImagePathsFromHtml(savedHtml)).toEqual([imagePath]);
  expect(savedHtml).toContain('正文');
  expect(savedHtml).not.toContain('base64');
  expect(savedHtml).not.toContain('previewData');
  first.unmount();

  const reopened = render(<ControlledEditor initialHtml={savedHtml} />);
  await waitFor(() => {
    expect(reopened.container.querySelector('img')?.getAttribute('src')).toBe(
      preview,
    );
  });
  expect(globalThis.pugyingDesktop.readLocalImageDataUrl).toHaveBeenCalledWith(
    imagePath,
  );
});

it('shows a readable message when a saved image cannot be read', async () => {
  vi.mocked(globalThis.pugyingDesktop.readLocalImageDataUrl).mockRejectedValue(
    new Error('missing file'),
  );
  render(
    <ControlledEditor
      initialHtml={`<p>正文</p><img src="file://${imagePath}" data-local-path="${imagePath}">`}
    />,
  );
  await screen.findByText('图片无法读取，请重新插入');
});

it('persists image captions as visible HTML and restores them without duplicating the image', async () => {
  const first = render(
    <ControlledEditor
      initialHtml={`<p>正文</p><img src="file://${imagePath}" data-local-path="${imagePath}">`}
    />,
  );
  await waitFor(() =>
    expect(first.container.querySelector('img')).not.toBeNull(),
  );
  fireEvent.click(first.container.querySelector('img')!);
  fireEvent.change(screen.getByRole('textbox', { name: '图片描述' }), {
    target: { value: '一张图片 🌼' },
  });
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  const saved = body.editor.getHTML();
  expect(saved).toContain('<figcaption>一张图片 🌼</figcaption>');
  expect(extractLocalImagePathsFromHtml(saved)).toEqual([imagePath]);
  first.unmount();
  const second = render(<ControlledEditor initialHtml={saved} />);
  await waitFor(() =>
    expect(second.container.querySelector('img')?.getAttribute('src')).toBe(
      preview,
    ),
  );
  expect(second.container.querySelectorAll('img')).toHaveLength(1);
  expect(
    (screen.getByRole('textbox', { name: '图片描述' }) as HTMLInputElement)
      .value,
  ).toBe('一张图片 🌼');
  const restored = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  expect(restored.editor.getHTML()).toContain(
    '<figcaption>一张图片 🌼</figcaption>',
  );
});

it('limits captions to 50 Unicode characters and supports deleting and undoing an image', async () => {
  const view = render(
    <ControlledEditor
      initialHtml={`<p>正文</p><img src="file://${imagePath}" data-local-path="${imagePath}">`}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector('img')).not.toBeNull(),
  );
  fireEvent.click(view.container.querySelector('img')!);
  fireEvent.change(screen.getByRole('textbox', { name: '图片描述' }), {
    target: { value: '🌼'.repeat(51) },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole('textbox', { name: '图片描述' }) as HTMLInputElement)
        .value,
    ).toBe('🌼'.repeat(50)),
  );
  fireEvent.click(screen.getByRole('button', { name: '删除图片' }));
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([]);
  act(() => {
    body.editor.commands.undo();
  });
  expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([
    imagePath,
  ]);
});

it('replaces the selected image while keeping its caption and the surrounding article', async () => {
  const view = render(
    <ControlledEditor
      initialHtml={`<p>前文</p><figure data-article-image><img src="file://${imagePath}" data-local-path="${imagePath}"><figcaption>说明</figcaption></figure><p>后文</p>`}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector('img')).not.toBeNull(),
  );
  fireEvent.click(view.container.querySelector('img')!);
  vi.mocked(globalThis.pugyingDesktop.getPathForFile!).mockReturnValue(
    '/tmp/替换 #1.png',
  );
  const input = (
    await screen.findByRole('toolbar', { name: '图片操作' })
  ).querySelector('input')!;
  fireEvent.change(input, {
    target: {
      files: [new File(['new image'], 'new.png', { type: 'image/png' })],
    },
  });
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  await waitFor(() =>
    expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([
      '/tmp/替换 #1.png',
    ]),
  );
  expect(body.editor.getHTML()).toContain('前文');
  expect(body.editor.getHTML()).toContain('后文');
  expect(body.editor.getHTML()).toContain('<figcaption>说明</figcaption>');
  expect(body.editor.getHTML()).toContain('%231.png');
  expect(body.editor.getHTML()).not.toContain('base64');
});

it('imports a pasted local image at the current selection', async () => {
  render(<ControlledEditor />);
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.paste(body, {
    clipboardData: {
      files: [new File(['image'], 'paste.png', { type: 'image/png' })],
      getData: () => '',
    },
  });
  await waitFor(() =>
    expect(extractLocalImagePathsFromHtml(body.editor.getHTML())).toEqual([
      imagePath,
    ]),
  );
});

it('allows typing before the first image and after it without selecting the caption', async () => {
  render(
    <ControlledEditor
      initialHtml={`<img src="file://${imagePath}" data-local-path="${imagePath}">`}
    />,
  );
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.click(screen.getByRole('button', { name: '在图片前输入正文' }));
  act(() => {
    body.editor.commands.insertContent('前文');
  });
  fireEvent.click(screen.getByRole('button', { name: '在图片后输入正文' }));
  act(() => {
    body.editor.commands.insertContent('后文');
  });
  expect(body.editor.getHTML()).toMatch(/<p>前文<\/p><img[^>]+><p>后文<\/p>/);
});

it('continues typing after multiple inserted images and supports undo and redo', async () => {
  const view = render(<ControlledEditor initialHtml="<p></p>" />);
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.click(screen.getByRole('button', { name: '插入图片' }));
  fireEvent.change(view.container.querySelector('input[type=file]')!, {
    target: {
      files: [
        new File(['1'], '1.png', { type: 'image/png' }),
        new File(['2'], '2.png', { type: 'image/png' }),
      ],
    },
  });
  await waitFor(() =>
    expect(view.container.querySelectorAll('img')).toHaveLength(2),
  );
  expect(body.editor.state.selection.$from.parent.isTextblock).toBe(true);
  act(() => {
    body.editor.commands.insertContent('继续写正文');
  });
  expect(body.editor.getHTML()).toMatch(
    /<img[^>]+><img[^>]+><p>继续写正文<\/p>/,
  );
  act(() => {
    body.editor.commands.undo();
    body.editor.commands.redo();
  });
  expect(body.editor.getHTML()).toContain('继续写正文');
});

it('moves from a selected image into the following paragraph with Enter', async () => {
  const view = render(
    <ControlledEditor
      initialHtml={`<p>前文</p><img src="file://${imagePath}" data-local-path="${imagePath}"><p>后文</p>`}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector('img')).not.toBeNull(),
  );
  fireEvent.click(view.container.querySelector('img')!);
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  fireEvent.keyDown(body, { key: 'Enter', code: 'Enter' });
  expect(body.editor.state.selection.$from.parent.isTextblock).toBe(true);
  act(() => {
    body.editor.commands.insertContent('补充');
  });
  expect(body.editor.getHTML()).toContain('前文');
  expect(body.editor.getHTML()).toContain('后文');
  expect(body.editor.getHTML()).toContain('补充');
});

it('preserves ongoing typing when an image finishes reading asynchronously', async () => {
  const view = render(
    <ControlledEditor initialHtml="<p>前文</p><p>后文</p>" />,
  );
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  act(() => {
    body.editor.commands.setTextSelection(3);
  });
  fireEvent.click(screen.getByRole('button', { name: '插入图片' }));
  fireEvent.change(view.container.querySelector('input[type=file]')!, {
    target: { files: [new File(['image'], '1.png', { type: 'image/png' })] },
  });
  act(() => {
    body.editor.commands.setTextSelection(7);
    body.editor.commands.insertContent('继续');
  });
  await waitFor(() =>
    expect(view.container.querySelector('img')).not.toBeNull(),
  );
  expect(body.editor.state.selection.$from.parent.textContent).toBe('后文继续');
  act(() => {
    body.editor.commands.insertContent('输入');
  });
  expect(body.editor.getHTML()).toContain('后文继续输入');
});

it('returns from the caption to article text on Enter without submitting', async () => {
  render(
    <ControlledEditor
      initialHtml={`<img src="file://${imagePath}" data-local-path="${imagePath}"><p>后文</p>`}
    />,
  );
  const caption = screen.getByRole('textbox', { name: '图片描述' });
  caption.focus();
  fireEvent.change(caption, { target: { value: '图片描述' } });
  fireEvent.keyDown(caption, { key: 'Enter' });
  const body = screen.getByRole('textbox', {
    name: '正文',
  }) as HTMLDivElement & { editor: Editor };
  act(() => {
    body.editor.commands.insertContent('继续');
  });
  expect(body.editor.getHTML()).toContain('<p>继续后文</p>');
  expect(body.editor.getHTML()).toContain('<figcaption>图片描述</figcaption>');
});
