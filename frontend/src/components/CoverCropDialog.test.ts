import { describe, expect, it } from 'vitest';
import { clampOffset } from '@/components/CoverCropDialog';

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
