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
