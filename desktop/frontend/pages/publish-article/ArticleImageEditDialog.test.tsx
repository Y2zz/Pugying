// @vitest-environment jsdom
import {
  act,
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
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
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

it('drags the image beneath a fixed crop and stops at the image edge', async () => {
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
  const stage = screen.getByRole('group', { name: '图片裁剪区域' });
  Object.defineProperty(stage, 'getBoundingClientRect', {
    value: () => new DOMRect(0, 0, 400, 300),
  });
  Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: '1:1' }));
  const frame = screen.getByRole('button', { name: '移动图片' }).parentElement!;
  const frameStyle = frame.getAttribute('style');
  fireEvent.pointerDown(stage, { clientX: 100, clientY: 75 });
  fireEvent.pointerMove(stage, { clientX: 1000, clientY: 1000 });
  fireEvent.pointerUp(stage, { clientX: 1000, clientY: 1000 });
  expect(frame.getAttribute('style')).toBe(frameStyle);
  expect(image.style.transform).toBe('translate(12.5%, 0%) scale(1)');
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 600, 600, 0, 0, 600, 600);
});

it('maps dragging to image coordinates when the canvas is wider than the image', async () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 500, 300),
  );
  const saved = vi.fn();
  saveImage.mockResolvedValue('/tmp/cropped.png');
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      allowZoom
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  let image!: HTMLElement;
  await act(async () => {
    image = loadPreview();
  });
  const stage = screen.getByRole('group', { name: '图片裁剪区域' });
  Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: '1:1' }));
  fireEvent.change(await screen.findByRole('slider', { name: /图片缩放/ }), {
    target: { value: '200' },
  });
  const frame = screen.getByRole('button', { name: '移动图片' }).parentElement!;
  const frameStyle = frame.getAttribute('style');
  fireEvent.pointerDown(stage, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(stage, { clientX: 200, clientY: 100 });
  fireEvent.pointerUp(stage, { clientX: 200, clientY: 100 });
  expect(frame.getAttribute('style')).toBe(frameStyle);
  expect(image.style.transform).toBe('translate(25%, 0%) scale(2)');
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(
    image,
    150,
    150,
    300,
    300,
    0,
    0,
    600,
    600,
  );
});

it.each([
  [500, 300, 'ArrowLeft', 0, 0, 150, 150],
  [400, 500, 'ArrowUp', 50, 0, 250, 50],
] as const)(
  'uses live image boundaries in a %s by %s preview and exports the moved crop',
  async (width, height, key, left, top, sourceX, sourceY) => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
      width,
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(
      height,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, width, height),
    );
    const saved = vi.fn();
    saveImage.mockResolvedValue('/tmp/cropped.png');
    render(
      <ArticleImageEditDialog
        source={source}
        localPath="/tmp/original.png"
        allowZoom
        onClose={vi.fn()}
        onSaved={saved}
      />,
    );
    let image!: HTMLElement;
    await act(async () => {
      image = loadPreview();
    });
    const stage = screen.getByRole('group', { name: '图片裁剪区域' });
    Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: '1:1' }));
    const slider = await screen.findByRole('slider', { name: /图片缩放/ });
    fireEvent.change(slider, { target: { value: '200' } });
    const frame = screen.getByRole('button', {
      name: '移动图片',
    }).parentElement!;
    const edge = screen.getByRole('button', { name: '移动裁剪框上边' });
    // 方向键与鼠标都能进入放大后填满的原始留白区域。
    for (let step = 0; step < 30; step++) {
      fireEvent.keyDown(edge, { key, shiftKey: true });
    }
    expect(
      parseFloat(key === 'ArrowLeft' ? frame.style.left : frame.style.top),
    ).toBeLessThan(key === 'ArrowLeft' ? 50 : 100);
    fireEvent.pointerDown(edge, { clientX: 150, clientY: 110 });
    fireEvent.pointerUp(stage, {
      clientX: key === 'ArrowLeft' ? -1000 : 150,
      clientY: key === 'ArrowUp' ? -1000 : 110,
    });
    expect(parseFloat(frame.style.left)).toBeCloseTo(left);
    expect(parseFloat(frame.style.top)).toBeCloseTo(top);
    expect(image.style.transform).toBe('translate(0%, 0%) scale(2)');
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(drawImage).toHaveBeenCalledWith(
      image,
      expect.closeTo(sourceX),
      expect.closeTo(sourceY),
      300,
      300,
      0,
      0,
      600,
      600,
    );
    fireEvent.change(slider, { target: { value: '100' } });
    // 缩小后依然覆盖裁剪框，并且画面位于可见预览区内。
    expect(parseFloat(frame.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(frame.style.top)).toBeGreaterThanOrEqual(0);
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
    const args = drawImage.mock.calls[1];
    expect(args[1]).toBeGreaterThanOrEqual(0);
    expect(args[2]).toBeGreaterThanOrEqual(0);
    expect(args[1] + args[3]).toBeLessThanOrEqual(800);
    expect(args[2] + args[4]).toBeLessThanOrEqual(600);
  },
);

it('resizes beyond the original image and fits the crop when zoom is reduced', async () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 800, 300),
  );
  const saved = vi.fn();
  saveImage.mockResolvedValue('/tmp/cropped.png');
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      allowZoom
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  let image!: HTMLElement;
  await act(async () => {
    image = loadPreview();
  });
  const stage = screen.getByRole('group', { name: '图片裁剪区域' });
  Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: '自由' }));
  const slider = await screen.findByRole('slider', { name: /图片缩放/ });
  fireEvent.change(slider, { target: { value: '200' } });
  const frame = screen.getByRole('button', { name: '移动图片' }).parentElement!;
  fireEvent.pointerDown(
    screen.getByRole('button', { name: '调整裁剪框右上角' }),
    {
      clientX: 588,
      clientY: 12,
    },
  );
  fireEvent.pointerUp(stage, { clientX: 1000, clientY: 12 });
  expect(parseFloat(frame.style.width)).toBeCloseTo(600);
  expect(
    parseFloat(frame.style.left) + parseFloat(frame.style.width),
  ).toBeCloseTo(800);
  fireEvent.change(slider, { target: { value: '100' } });
  expect(parseFloat(frame.style.width)).toBeCloseTo(400);
  expect(parseFloat(frame.style.height)).toBeCloseTo(200);
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(drawImage).toHaveBeenCalledWith(
    image,
    0,
    expect.closeTo(100),
    800,
    expect.closeTo(400),
    0,
    0,
    800,
    400,
  );
});

it('moves a resized crop by its edge while its interior still pans the zoomed image', async () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 300),
  );
  const saved = vi.fn();
  saveImage.mockResolvedValue('/tmp/cropped.png');
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      allowZoom
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  let image!: HTMLElement;
  await act(async () => {
    image = loadPreview();
  });
  const stage = screen.getByRole('group', { name: '图片裁剪区域' });
  Object.defineProperty(stage, 'getBoundingClientRect', {
    value: () => new DOMRect(0, 0, 400, 300),
  });
  Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: '1:1' }));
  fireEvent.pointerDown(
    screen.getByRole('button', { name: '调整裁剪框右下角' }),
    {
      clientX: 338,
      clientY: 288,
    },
  );
  fireEvent.pointerUp(stage, { clientX: 238, clientY: 188 });
  fireEvent.change(await screen.findByRole('slider', { name: /图片缩放/ }), {
    target: { value: '200' },
  });
  const frame = screen.getByRole('button', { name: '移动图片' }).parentElement!;
  const width = frame.style.width;
  const height = frame.style.height;
  fireEvent.pointerDown(
    screen.getByRole('button', { name: '移动裁剪框上边' }),
    {
      clientX: 150,
      clientY: 10,
    },
  );
  fireEvent.pointerUp(stage, { clientX: 200, clientY: 60 });
  expect(parseFloat(frame.style.left)).toBeCloseTo(100);
  expect(parseFloat(frame.style.top)).toBeCloseTo(50);
  expect(frame.style.width).toBe(width);
  expect(frame.style.height).toBe(height);
  expect(image.style.transform).toBe('translate(0%, 0%) scale(2)');
  const frameStyle = frame.getAttribute('style');
  fireEvent.pointerDown(screen.getByRole('button', { name: '移动图片' }), {
    clientX: 200,
    clientY: 150,
  });
  fireEvent.pointerUp(stage, { clientX: 250, clientY: 150 });
  expect(frame.getAttribute('style')).toBe(frameStyle);
  expect(image.style.transform).toBe('translate(12.5%, 0%) scale(2)');
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(
    image,
    250,
    expect.closeTo(200),
    200,
    expect.closeTo(200),
    0,
    0,
    400,
    400,
  );
});

it('bounds edge dragging against a panned image and restores the crop when canceled', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  const image = loadPreview();
  const stage = screen.getByRole('group', { name: '图片裁剪区域' });
  Object.defineProperty(stage, 'getBoundingClientRect', {
    value: () => new DOMRect(0, 0, 400, 300),
  });
  Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: '1:1' }));
  fireEvent.pointerDown(stage, { clientX: 100, clientY: 100 });
  fireEvent.pointerUp(stage, { clientX: 1000, clientY: 1000 });
  const frame = screen.getByRole('button', { name: '移动图片' }).parentElement!;
  const originalFrame = frame.getAttribute('style');
  const transform = image.style.transform;
  const edge = screen.getByRole('button', { name: '移动裁剪框上边' });
  fireEvent.pointerDown(edge, { clientX: 150, clientY: 10 });
  fireEvent.pointerMove(stage, { clientX: -1000, clientY: -1000 });
  expect(frame.getAttribute('style')).toBe(originalFrame);
  fireEvent.pointerMove(stage, { clientX: 1000, clientY: 1000 });
  expect(frame.style.left).toBe('100px');
  expect(frame.style.top).toBe('0px');
  expect(image.style.transform).toBe(transform);
  fireEvent.pointerCancel(stage);
  expect(frame.getAttribute('style')).toBe(originalFrame);
  expect(image.style.transform).toBe(transform);
  for (const label of ['上边', '右边', '下边', '左边']) {
    fireEvent.keyDown(
      screen.getByRole('button', { name: `移动裁剪框${label}` }),
      {
        key: 'ArrowRight',
      },
    );
  }
  expect(parseFloat(frame.style.left)).toBeCloseTo(54);
  expect(image.style.transform).toBe(transform);
});

it('exports a selected square ratio and moves the image with the keyboard', async () => {
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
  fireEvent.keyDown(screen.getByRole('button', { name: '移动图片' }), {
    key: 'ArrowRight',
  });
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(
    image,
    98,
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

it('corrects image position when switching crop ratios or reducing zoom after dragging', async () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 300),
  );
  const saved = vi.fn();
  saveImage.mockResolvedValue('/tmp/cropped.png');
  render(
    <ArticleImageEditDialog
      source={source}
      localPath="/tmp/original.png"
      allowZoom
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  let image!: HTMLElement;
  await act(async () => {
    image = loadPreview();
  });
  const stage = screen.getByRole('group', { name: '图片裁剪区域' });
  Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: '1:1' }));
  const slider = await screen.findByRole('slider', { name: /图片缩放/ });
  fireEvent.change(slider, { target: { value: '300' } });
  fireEvent.pointerDown(stage, { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(stage, { clientX: 3000, clientY: 3000 });
  fireEvent.pointerUp(stage, { clientX: 3000, clientY: 3000 });
  fireEvent.change(slider, { target: { value: '100' } });
  expect(image.style.transform).toBe('translate(12.5%, 0%) scale(1)');
  fireEvent.click(screen.getByRole('button', { name: '原图比例' }));
  expect(image.style.transform).toBe('translate(0%, 0%) scale(1)');
  const frame = screen.getByRole('button', { name: '移动图片' }).parentElement!;
  expect(frame.style.left).toBe('0px');
  expect(frame.style.top).toBe('0px');
  expect(frame.style.width).toBe('400px');
  expect(frame.style.height).toBe('300px');
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 800, 600, 0, 0, 800, 600);
});
