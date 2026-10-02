import {
  centeredImageCrop,
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
