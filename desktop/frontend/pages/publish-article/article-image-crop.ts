export type CropPoint = { x: number; y: number };
export type ArticleImageCrop = { x: number; y: number; w: number; h: number };
export type CropCorner = 'nw' | 'ne' | 'sw' | 'se';
export const FULL_IMAGE_CROP: ArticleImageCrop = { x: 0, y: 0, w: 1, h: 1 };
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** 坐标相对整张图片归一化；比例须用自然图片比例转换，不能使用屏幕像素。 */
export function centeredImageCrop(
  ratio: number,
  imageRatio: number,
): ArticleImageCrop {
  const normalizedRatio = ratio / imageRatio;
  const w = Math.min(1, normalizedRatio);
  const h = Math.min(1, 1 / normalizedRatio);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

export function moveImageCrop(
  crop: ArticleImageCrop,
  delta: CropPoint,
): ArticleImageCrop {
  return {
    ...crop,
    x: clamp(crop.x + delta.x, 0, 1 - crop.w),
    y: clamp(crop.y + delta.y, 0, 1 - crop.h),
  };
}

export function resizeImageCrop(
  crop: ArticleImageCrop,
  corner: CropCorner,
  point: CropPoint,
  normalizedRatio: number | null,
): ArticleImageCrop {
  const left = corner.endsWith('w');
  const top = corner.startsWith('n');
  const anchor = {
    x: left ? crop.x + crop.w : crop.x,
    y: top ? crop.y + crop.h : crop.y,
  };
  const maxW = left ? anchor.x : 1 - anchor.x;
  const maxH = top ? anchor.y : 1 - anchor.y;
  let w = clamp(
    left ? anchor.x - point.x : point.x - anchor.x,
    Math.min(0.01, maxW),
    maxW,
  );
  let h = clamp(
    top ? anchor.y - point.y : point.y - anchor.y,
    Math.min(0.01, maxH),
    maxH,
  );
  if (normalizedRatio) {
    w = Math.min(
      Math.max(w, h * normalizedRatio),
      maxW,
      maxH * normalizedRatio,
    );
    h = w / normalizedRatio;
  }
  return {
    x: left ? anchor.x - w : anchor.x,
    y: top ? anchor.y - h : anchor.y,
    w,
    h,
  };
}
