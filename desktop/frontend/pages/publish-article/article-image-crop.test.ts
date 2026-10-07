import {
  centeredImageCrop,
  fitCropImage,
  moveImageCrop,
  resizeImageCrop,
  sourceImageCrop,
  clampImageOffset,
  imageCropBounds,
  fitImageCrop,
} from './article-image-crop';

it.each([1, 4 / 3, 9 / 16, 80, 1 / 80])(
  'keeps every crop ratio covered while panning a source ratio %s',
  (imageRatio) => {
    for (const ratio of [1, 2 / 3, 3 / 2, 9 / 16, 16 / 9, 3 / 4]) {
      const frame = centeredImageCrop(ratio, imageRatio);
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.w).toBeLessThanOrEqual(1);
      expect(frame.y + frame.h).toBeLessThanOrEqual(1);
      for (const zoom of [1, 2, 3]) {
        for (const wanted of [
          { x: -10, y: -10 },
          { x: 10, y: 10 },
        ]) {
          const offset = clampImageOffset(wanted, frame, zoom);
          const left = (1 - zoom) / 2 + offset.x;
          const top = (1 - zoom) / 2 + offset.y;
          expect(left).toBeLessThanOrEqual(frame.x + 1e-12);
          expect(top).toBeLessThanOrEqual(frame.y + 1e-12);
          expect(left + zoom).toBeGreaterThanOrEqual(frame.x + frame.w - 1e-12);
          expect(top + zoom).toBeGreaterThanOrEqual(frame.y + frame.h - 1e-12);
          const source = sourceImageCrop(frame, zoom, offset);
          expect(source.x).toBeGreaterThanOrEqual(-1e-12);
          expect(source.y).toBeGreaterThanOrEqual(-1e-12);
          expect(source.x + source.w).toBeLessThanOrEqual(1 + 1e-12);
          expect(source.y + source.h).toBeLessThanOrEqual(1 + 1e-12);
          expect((source.w * imageRatio) / source.h).toBeCloseTo(ratio);
        }
      }
    }
  },
);

it('corrects a panned image when zoom or crop dimensions change', () => {
  const square = centeredImageCrop(1, 4 / 3);
  const offset = clampImageOffset({ x: 10, y: 10 }, square, 3);
  const full = { x: 0, y: 0, w: 1, h: 1 };
  expect(clampImageOffset(offset, full, 1)).toEqual({ x: 0, y: 0 });
  const resized = resizeImageCrop(square, 'nw', { x: -10, y: -10 }, null);
  const next = clampImageOffset(offset, resized, 1);
  const source = sourceImageCrop(resized, 1, next);
  expect(source.x).toBeGreaterThanOrEqual(0);
  expect(source.y).toBeGreaterThanOrEqual(0);
  expect(source.x + source.w).toBeLessThanOrEqual(1);
  expect(source.y + source.h).toBeLessThanOrEqual(1);
});

it('samples the enlarged image inside a fixed crop frame', () => {
  const frame = { x: 0.125, y: 0, w: 0.75, h: 1 };
  expect(sourceImageCrop(frame, 1)).toEqual(frame);
  expect(sourceImageCrop(frame, 2)).toEqual({
    x: 0.3125,
    y: 0.25,
    w: 0.375,
    h: 0.5,
  });
});

it.each([
  { x: 0, y: 0, w: 0.25, h: 0.25 },
  { x: 0.75, y: 0.75, w: 0.25, h: 0.25 },
  { x: 0, y: 0, w: 1, h: 1 },
])('keeps edge crops within the source at maximum zoom: %j', (frame) => {
  const source = sourceImageCrop(frame, 3);
  expect(source.x).toBeGreaterThanOrEqual(0);
  expect(source.y).toBeGreaterThanOrEqual(0);
  expect(source.x + source.w).toBeLessThanOrEqual(1);
  expect(source.y + source.h).toBeLessThanOrEqual(1);
  expect(source.w / source.h).toBeCloseTo(frame.w / frame.h);
});

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

it.each([1, 1.5, 2, 3])(
  'keeps moving crops within the visible canvas and the panned image at zoom %s',
  (zoom) => {
    const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const canvas = { x: -0.25, y: -0.125, w: 1.5, h: 1.25 };
    for (const wanted of [
      { x: -10, y: 10 },
      { x: 10, y: -10 },
    ]) {
      const offset = clampImageOffset(wanted, crop, zoom);
      for (const delta of [
        { x: -10, y: -10 },
        { x: 10, y: 10 },
      ]) {
        const moved = moveImageCrop(crop, delta, zoom, offset, canvas);
        expect(moved.w).toBe(crop.w);
        expect(moved.h).toBe(crop.h);
        expect(moved.x).toBeGreaterThanOrEqual(canvas.x);
        expect(moved.y).toBeGreaterThanOrEqual(canvas.y);
        expect(moved.x + moved.w).toBeLessThanOrEqual(canvas.x + canvas.w);
        expect(moved.y + moved.h).toBeLessThanOrEqual(canvas.y + canvas.h);
        expect(moved.x).toBeGreaterThanOrEqual(0.5 + offset.x - zoom / 2);
        expect(moved.y).toBeGreaterThanOrEqual(0.5 + offset.y - zoom / 2);
        expect(moved.x + moved.w).toBeLessThanOrEqual(
          0.5 + offset.x + zoom / 2,
        );
        expect(moved.y + moved.h).toBeLessThanOrEqual(
          0.5 + offset.y + zoom / 2,
        );
      }
    }
  },
);

it('moves and resizes crops beyond initial boundaries using the current image bounds', () => {
  const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const bounds = imageCropBounds(2, { x: 0.25, y: -0.25 });
  expect(bounds).toEqual({ x: -0.25, y: -0.75, w: 2, h: 2 });
  expect(
    moveImageCrop(crop, { x: 10, y: -10 }, 2, { x: 0.25, y: -0.25 }),
  ).toEqual({
    x: 1.25,
    y: -0.75,
    w: 0.5,
    h: 0.5,
  });
  const resized = resizeImageCrop(crop, 'nw', { x: -10, y: -10 }, null, bounds);
  expect(resized).toEqual({ x: -0.25, y: -0.75, w: 1, h: 1.5 });
  const sampled = sourceImageCrop(resized, 2, { x: 0.25, y: -0.25 });
  expect(sampled).toEqual({ x: 0, y: 0, w: 0.5, h: 0.75 });
});

it('preserves crop ratio when smaller live bounds require repositioning and resizing', () => {
  expect(
    fitImageCrop(
      { x: -0.25, y: -0.25, w: 1.5, h: 1 },
      { x: 0, y: 0, w: 1, h: 1 },
    ),
  ).toEqual({ x: 0, y: expect.closeTo(0), w: 1, h: expect.closeTo(2 / 3) });
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
