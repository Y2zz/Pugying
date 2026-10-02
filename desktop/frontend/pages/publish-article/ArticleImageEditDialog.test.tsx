// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ArticleImageEditDialog } from './ArticleImageEditDialog';

const source = 'data:image/png;base64,aW1hZ2U=';
const drawImage = vi.fn();
const context = { filter: 'none', drawImage };
const saveImage = vi.fn();

beforeEach(() => {
  drawImage.mockClear();
  saveImage.mockReset();
  vi.stubGlobal('pugyingDesktop', {
    available: true,
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    saveArticleImage: saveImage,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(source);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function loadPreview() {
  const image = screen.getByAltText('图片裁剪预览');
  Object.defineProperties(image, {
    naturalWidth: { value: 800 },
    naturalHeight: { value: 600 },
  });
  fireEvent.load(image);
  return image;
}

it('saves the original crop as a new local image and returns its path', async () => {
  const saved = vi.fn();
  saveImage.mockResolvedValue('/tmp/edited.png');
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  const image = loadPreview();
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith('/tmp/edited.png', source),
  );
  expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 800, 600, 0, 0, 800, 600);
  expect(saveImage).toHaveBeenCalledWith(source, '/tmp/original.png');
});

it('keeps the original node when saving fails', async () => {
  const saved = vi.fn();
  saveImage.mockResolvedValue(null);
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  loadPreview();
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saveImage).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: '确定' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('exports the drawn crop at natural image resolution', async () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  const saved = vi.fn();
  saveImage.mockResolvedValue('/tmp/cropped.png');
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  const image = loadPreview();
  const stage = image.parentElement!;
  Object.defineProperty(stage, 'getBoundingClientRect', {
    value: () => new DOMRect(0, 0, 400, 300),
  });
  Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: '自由' }));
  fireEvent.pointerDown(stage, { clientX: 100, clientY: 75 });
  fireEvent.pointerMove(stage, { clientX: 300, clientY: 225 });
  fireEvent.pointerUp(stage, { clientX: 300, clientY: 225 });
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(
    image,
    200,
    150,
    400,
    300,
    0,
    0,
    400,
    300,
  );
});

it('exports a selected square ratio in natural pixels and moves the crop with the keyboard', async () => {
  const saved = vi.fn();
  saveImage.mockResolvedValue('/tmp/square.png');
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  const image = loadPreview();
  fireEvent.click(screen.getByRole('button', { name: '1:1' }));
  fireEvent.keyDown(screen.getByRole('button', { name: '移动裁剪框' }), {
    key: 'ArrowRight',
  });
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(
    image,
    102,
    0,
    600,
    600,
    0,
    0,
    600,
    600,
  );
});

it('canceling the crop leaves the original image unchanged and does not write a file', () => {
  const close = vi.fn();
  const saved = vi.fn();
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      onClose={close}
      onSaved={saved}
    />,
  );
  loadPreview();
  fireEvent.click(screen.getByRole('button', { name: '16:9' }));
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(close).toHaveBeenCalledOnce();
  expect(saveImage).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
});
