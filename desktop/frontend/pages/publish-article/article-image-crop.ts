export type CropPoint = { x: number; y: number };
export type ArticleImageCrop = { x: number; y: number; w: number; h: number };
export type CropCorner = 'nw' | 'ne' | 'sw' | 'se';
export const FULL_IMAGE_CROP: ArticleImageCrop = { x: 0, y: 0, w: 1, h: 1 };
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** 图片平移以初始图片尺寸归一化，边缘始终覆盖裁剪框。 */
export function clampImageOffset(
  offset: CropPoint,
  crop: ArticleImageCrop,
  zoom: number,
): CropPoint {
  return {
    x: clamp(
      offset.x,
      crop.x + crop.w - (1 + zoom) / 2,
      crop.x + (zoom - 1) / 2,
    ),
    y: clamp(
      offset.y,
      crop.y + crop.h - (1 + zoom) / 2,
      crop.y + (zoom - 1) / 2,
    ),
  };
}

/** 将裁剪框范围反算到缩放、平移前的原图坐标。 */
export function sourceImageCrop(
  crop: ArticleImageCrop,
  zoom: number,
  offset: CropPoint = { x: 0, y: 0 },
): ArticleImageCrop {
  const w = crop.w / zoom;
  const h = crop.h / zoom;
  return {
    x: clamp(0.5 + (crop.x - 0.5 - offset.x) / zoom, 0, 1 - w),
    y: clamp(0.5 + (crop.y - 0.5 - offset.y) / zoom, 0, 1 - h),
    w,
    h,
  };
}

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
  zoom = 1,
  offset: CropPoint = { x: 0, y: 0 },
  canvas?: ArticleImageCrop,
): ArticleImageCrop {
  const bounds = imageCropBounds(zoom, offset, canvas);
  return {
    ...crop,
    x: clamp(crop.x + delta.x, bounds.x, bounds.x + bounds.w - crop.w),
    y: clamp(crop.y + delta.y, bounds.y, bounds.y + bounds.h - crop.h),
  };
}

/** 实时图片边界，可与可见预览区域取交集；坐标不限于初始的 0～1。 */
export function imageCropBounds(
  zoom: number,
  offset: CropPoint,
  canvas?: ArticleImageCrop,
): ArticleImageCrop {
  const left = 0.5 + offset.x - zoom / 2;
  const top = 0.5 + offset.y - zoom / 2;
  const x = canvas ? Math.max(left, canvas.x) : left;
  const y = canvas ? Math.max(top, canvas.y) : top;
  const right = canvas
    ? Math.min(left + zoom, canvas.x + canvas.w)
    : left + zoom;
  const bottom = canvas
    ? Math.min(top + zoom, canvas.y + canvas.h)
    : top + zoom;
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

/** 保持裁剪比例，将范围放回变化后的可见边界。 */
export function fitImageCrop(
  crop: ArticleImageCrop,
  bounds: ArticleImageCrop,
): ArticleImageCrop {
  const scale = Math.min(1, bounds.w / crop.w, bounds.h / crop.h);
  const w = crop.w * scale;
  const h = crop.h * scale;
  return {
    x: clamp(crop.x + (crop.w - w) / 2, bounds.x, bounds.x + bounds.w - w),
    y: clamp(crop.y + (crop.h - h) / 2, bounds.y, bounds.y + bounds.h - h),
    w,
    h,
  };
}

export function resizeImageCrop(
  crop: ArticleImageCrop,
  corner: CropCorner,
  point: CropPoint,
  normalizedRatio: number | null,
  bounds: ArticleImageCrop = FULL_IMAGE_CROP,
): ArticleImageCrop {
  const left = corner.endsWith('w');
  const top = corner.startsWith('n');
  const anchor = {
    x: left ? crop.x + crop.w : crop.x,
    y: top ? crop.y + crop.h : crop.y,
  };
  const maxW = left ? anchor.x - bounds.x : bounds.x + bounds.w - anchor.x;
  const maxH = top ? anchor.y - bounds.y : bounds.y + bounds.h - anchor.y;
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
    w = Math.min((w + h * normalizedRatio) / 2, maxW, maxH * normalizedRatio);
    h = w / normalizedRatio;
  }
  return {
    x: left ? anchor.x - w : anchor.x,
    y: top ? anchor.y - h : anchor.y,
    w,
    h,
  };
}

/** 图片保持原比例适配预览区，坐标计算使用实际显示尺寸。 */
export function fitCropImage(
  image: { width: number; height: number },
  viewport: { width: number; height: number },
): { width: number; height: number } {
  if (
    image.width <= 0 ||
    image.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  return { width: image.width * scale, height: image.height * scale };
}
