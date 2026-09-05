/**
 * 封面裁剪几何：取景框适配、cover 铺满、偏移钳制与缩放锚点。
 * 与 UI 解耦，便于单测。
 */

/** 裁剪框尺寸：在固定台面内按目标比例 contain */
export function fitViewport(
  stageW: number,
  stageH: number,
  ratio: number,
): { w: number; h: number } {
  if (stageW <= 0 || stageH <= 0 || ratio <= 0) {
    return { w: 0, h: 0 };
  }
  const w = Math.min(stageW, stageH * ratio);
  return { w, h: w / ratio };
}

/** 以 cover 方式铺满视窗，再乘用户缩放（≥1 保证始终盖住） */
export function fitFrame(
  naturalW: number,
  naturalH: number,
  vw: number,
  vh: number,
  scale: number,
): { displayW: number; displayH: number } {
  if (!naturalW || !naturalH || !vw || !vh) {
    return { displayW: 0, displayH: 0 };
  }
  const cover = Math.max(vw / naturalW, vh / naturalH) * Math.max(1, scale);
  return {
    displayW: naturalW * cover,
    displayH: naturalH * cover,
  };
}

/**
 * 限制偏移：图片边缘不得进入裁剪框内侧（不允许露出空白）。
 * 图片中心默认在视窗中心，offset 为相对位移。
 */
export function clampOffset(
  offset: { x: number; y: number },
  displayW: number,
  displayH: number,
  vw: number,
  vh: number,
): { x: number; y: number } {
  if (!displayW || !displayH || !vw || !vh) {
    return { x: 0, y: 0 };
  }
  const maxX = Math.max(0, (displayW - vw) / 2);
  const maxY = Math.max(0, (displayH - vh) / 2);
  const x = Math.min(maxX, Math.max(-maxX, offset.x));
  const y = Math.min(maxY, Math.max(-maxY, offset.y));
  return {
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
}

/** 当前取景框中心对应的源图自然像素坐标 */
export function viewportCenterInNatural(params: {
  offset: { x: number; y: number };
  displayW: number;
  displayH: number;
  vw: number;
  vh: number;
  naturalW: number;
  naturalH: number;
}): { x: number; y: number } {
  const { offset, displayW, displayH, vw, vh, naturalW, naturalH } = params;
  if (!displayW || !displayH || !vw || !vh || !naturalW || !naturalH) {
    return { x: naturalW / 2, y: naturalH / 2 };
  }
  const left = (vw - displayW) / 2 + offset.x;
  const top = (vh - displayH) / 2 + offset.y;
  return {
    x: ((vw / 2 - left) / displayW) * naturalW,
    y: ((vh / 2 - top) / displayH) * naturalH,
  };
}

/**
 * 缩放或以新 display 尺寸重算时，使指定自然像素点仍落在取景框中心。
 */
export function offsetToKeepNaturalPointCentered(params: {
  naturalX: number;
  naturalY: number;
  displayW: number;
  displayH: number;
  vw: number;
  vh: number;
  naturalW: number;
  naturalH: number;
}): { x: number; y: number } {
  const { naturalX, naturalY, displayW, displayH, vw, vh, naturalW, naturalH } =
    params;
  if (!displayW || !displayH || !vw || !vh || !naturalW || !naturalH) {
    return { x: 0, y: 0 };
  }
  const left = vw / 2 - (naturalX / naturalW) * displayW;
  const top = vh / 2 - (naturalY / naturalH) * displayH;
  const offset = {
    x: left - (vw - displayW) / 2,
    y: top - (vh - displayH) / 2,
  };
  return clampOffset(offset, displayW, displayH, vw, vh);
}

/** 取景框相对源图的自然像素裁切矩形 */
export function cropRectInNatural(params: {
  offset: { x: number; y: number };
  displayW: number;
  displayH: number;
  vw: number;
  vh: number;
  naturalW: number;
  naturalH: number;
}): { sx: number; sy: number; sw: number; sh: number } {
  const { offset, displayW, displayH, vw, vh, naturalW, naturalH } = params;
  const left = (vw - displayW) / 2 + offset.x;
  const top = (vh - displayH) / 2 + offset.y;
  const scaleX = naturalW / displayW;
  const scaleY = naturalH / displayH;
  const sx = Math.max(0, -left * scaleX);
  const sy = Math.max(0, -top * scaleY);
  const sw = Math.min(naturalW - sx, vw * scaleX);
  const sh = Math.min(naturalH - sy, vh * scaleY);
  return { sx, sy, sw, sh };
}
