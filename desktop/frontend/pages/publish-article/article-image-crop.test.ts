import {
  centeredImageCrop,
  fitCropImage,
  moveImageCrop,
  resizeImageCrop,
} from './article-image-crop';

it.each([1, 2 / 3, 3 / 2, 9 / 16, 16 / 9])(
  'keeps crop ratio %s correct on a non-square source image',
  (ratio) => {
    const crop = centeredImageCrop(ratio, 800 / 600);
    expect((crop.w * 800) / (crop.h * 600)).toBeCloseTo(ratio);
    expect(crop.x + crop.w / 2).toBeCloseTo(0.5);
    expect(crop.y + crop.h / 2).toBeCloseTo(0.5);
    const resized = resizeImageCrop(
      crop,
      'se',
      { x: 2, y: 2 },
      ratio / (800 / 600),
    );
    expect((resized.w * 800) / (resized.h * 600)).toBeCloseTo(ratio);
    expect(resized.x + resized.w).toBeLessThanOrEqual(1);
    expect(resized.y + resized.h).toBeLessThanOrEqual(1);
  },
);

it('keeps the moving crop inside the image while preserving its dimensions', () => {
  const original = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  expect(moveImageCrop(original, { x: 4, y: -4 })).toEqual({
    x: 0.5,
    y: 0,
    w: 0.5,
    h: 0.5,
  });
});

it('keeps the opposite corner fixed when resizing a free crop', () => {
  const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const resized = resizeImageCrop(crop, 'nw', { x: 0.1, y: 0.2 }, null);
  expect(resized.x).toBeCloseTo(0.1);
  expect(resized.y).toBeCloseTo(0.2);
  expect(resized.w).toBeCloseTo(0.65);
  expect(resized.h).toBeCloseTo(0.55);
  const reverse = resizeImageCrop(crop, 'nw', { x: 1, y: 1 }, null);
  expect(reverse.w).toBeGreaterThan(0);
  expect(reverse.h).toBeGreaterThan(0);
  expect(reverse.x + reverse.w).toBeCloseTo(0.75);
});

it('shrinks a locked crop with horizontal or vertical movement while retaining the opposite corner', () => {
  const crop = { x: 0.1, y: 0.1, w: 0.6, h: 0.6 };
  const horizontal = resizeImageCrop(crop, 'se', { x: 0.5, y: 0.7 }, 1);
  const vertical = resizeImageCrop(crop, 'se', { x: 0.7, y: 0.5 }, 1);
  for (const next of [horizontal, vertical]) {
    expect(next.w).toBeLessThan(crop.w);
    expect(next.h).toBeLessThan(crop.h);
    expect(next.w / next.h).toBeCloseTo(1);
    expect(next.x).toBe(crop.x);
    expect(next.y).toBe(crop.y);
  }
});

it.each([
  [1200, 800, 480, 320],
  [800, 1200, 480, 320],
  [8000, 100, 360, 240],
  [100, 8000, 360, 240],
])(
  'fits a %s by %s image inside the viewport without changing its ratio',
  (width, height, viewportWidth, viewportHeight) => {
    const result = fitCropImage(
      { width, height },
      { width: viewportWidth, height: viewportHeight },
    );
    expect(result.width / result.height).toBeCloseTo(width / height);
    expect(result.width).toBeLessThanOrEqual(viewportWidth);
    expect(result.height).toBeLessThanOrEqual(viewportHeight);
  },
);

it('waits for image and viewport dimensions before sizing the crop surface', () => {
  expect(
    fitCropImage({ width: 0, height: 0 }, { width: 400, height: 300 }),
  ).toEqual({ width: 0, height: 0 });
  expect(
    fitCropImage({ width: 800, height: 600 }, { width: 0, height: 0 }),
  ).toEqual({ width: 0, height: 0 });
});
