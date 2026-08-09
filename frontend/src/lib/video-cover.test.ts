import { describe, expect, it } from 'vitest';
import { centerCropRect } from '@/lib/video-cover';

describe('centerCropRect', () => {
  it('crops left/right for landscape source into 3:4', () => {
    // 1920x1080 → 3:4 cover uses full height, width = 1080 * 0.75 = 810
    const rect = centerCropRect(1920, 1080, 3 / 4);
    expect(rect.sh).toBe(1080);
    expect(rect.sw).toBeCloseTo(810);
    expect(rect.sx).toBeCloseTo((1920 - 810) / 2);
    expect(rect.sy).toBe(0);
  });

  it('crops top/bottom for portrait source into 16:9', () => {
    // 1080x1920 → 16:9 uses full width, height = 1080 / (16/9) = 607.5
    const rect = centerCropRect(1080, 1920, 16 / 9);
    expect(rect.sw).toBe(1080);
    expect(rect.sh).toBeCloseTo(1080 / (16 / 9));
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBeCloseTo((1920 - 1080 / (16 / 9)) / 2);
  });

  it('keeps full frame when ratios already match', () => {
    const rect = centerCropRect(900, 1200, 3 / 4);
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 900, sh: 1200 });
  });
});
