import { describe, expect, it } from 'vitest';
import {
  clampOffset,
  fitViewport,
  offsetToKeepNaturalPointCentered,
  viewportCenterInNatural,
} from '@/lib/cover-crop-geometry';

describe('fitViewport', () => {
  // 台面尺寸恒定（416x320），不同比例只改变裁剪框，不改变外壳
  const stageW = 416;
  const stageH = 320;

  it('fits a portrait 3:4 frame by stage height', () => {
    expect(fitViewport(stageW, stageH, 3 / 4)).toEqual({ w: 240, h: 320 });
  });

  it('fits a landscape 4:3 frame by stage width', () => {
    const frame = fitViewport(stageW, stageH, 4 / 3);
    expect(frame.w).toBe(416);
    expect(frame.h).toBeCloseTo(312, 0);
  });

  it('never exceeds the stage in either direction', () => {
    for (const ratio of [3 / 4, 1, 4 / 3, 4, 0.2]) {
      const frame = fitViewport(stageW, stageH, ratio);
      expect(frame.w).toBeLessThanOrEqual(stageW);
      expect(frame.h).toBeLessThanOrEqual(stageH);
      expect(frame.w / frame.h).toBeCloseTo(ratio, 5);
    }
  });

  it('returns zero size before the stage is measured', () => {
    expect(fitViewport(0, 0, 3 / 4)).toEqual({ w: 0, h: 0 });
  });
});

describe('clampOffset', () => {
  it('keeps offset at origin when image exactly fills the viewport', () => {
    expect(clampOffset({ x: 20, y: -10 }, 300, 400, 300, 400)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('clamps so the image cannot expose empty edges', () => {
    // display 600x800 over viewport 300x400 → max offset ±150 / ±200
    expect(clampOffset({ x: 999, y: 999 }, 600, 800, 300, 400)).toEqual({
      x: 150,
      y: 200,
    });
    expect(clampOffset({ x: -999, y: -999 }, 600, 800, 300, 400)).toEqual({
      x: -150,
      y: -200,
    });
  });

  it('passes through offsets already inside the bounds', () => {
    expect(clampOffset({ x: 40, y: -30 }, 600, 800, 300, 400)).toEqual({
      x: 40,
      y: -30,
    });
  });
});

describe('composition center helpers', () => {
  it('round-trips center through resize-style offset recompute', () => {
    const naturalW = 1200;
    const naturalH = 1600;
    const displayW = 600;
    const displayH = 800;
    const vw = 300;
    const vh = 400;
    const offset = { x: 40, y: -30 };
    const center = viewportCenterInNatural({
      offset,
      displayW,
      displayH,
      vw,
      vh,
      naturalW,
      naturalH,
    });
    const next = offsetToKeepNaturalPointCentered({
      naturalX: center.x,
      naturalY: center.y,
      displayW,
      displayH,
      vw,
      vh,
      naturalW,
      naturalH,
    });
    expect(next.x).toBeCloseTo(offset.x, 5);
    expect(next.y).toBeCloseTo(offset.y, 5);
  });
});
