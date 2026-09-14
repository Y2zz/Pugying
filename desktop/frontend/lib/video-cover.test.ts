import { describe, expect, it } from 'vitest';
import {
  centerCropRect,
  clampVideoSeekTime,
  filmSelectorLeftToTime,
  filmstripCellLayout,
  filmThumbSampleTime,
  filmTrackXToTime,
  formatVideoTime,
  isFilmSeekTrivial,
  timeToFilmSelectorLeft,
} from '@/lib/video-cover';

describe('centerCropRect', () => {
  it('crops left/right for landscape source into 3:4', () => {
    // 1920x1080 → 3:4 cover uses full height, width = 1080 * 0.75 = 810
    const rect = centerCropRect(1920, 1080, 3 / 4);
    expect(rect.sh).toBe(1080);
    expect(rect.sw).toBeCloseTo(810);
    expect(rect.sx).toBeCloseTo((1920 - 810) / 2);
    expect(rect.sy).toBe(0);
  });

  it('crops top/bottom for portrait source into 4:3', () => {
    // 1080x1920 → 4:3 uses full width, height = 1080 / (4/3) = 810
    const rect = centerCropRect(1080, 1920, 4 / 3);
    expect(rect.sw).toBe(1080);
    expect(rect.sh).toBeCloseTo(1080 / (4 / 3));
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBeCloseTo((1920 - 1080 / (4 / 3)) / 2);
  });

  it('keeps full frame when ratios already match', () => {
    const rect = centerCropRect(900, 1200, 3 / 4);
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 900, sh: 1200 });
  });
});

describe('clampVideoSeekTime', () => {
  it('keeps time away from the last 0.05s to avoid black frames', () => {
    expect(clampVideoSeekTime(10, 10)).toBeCloseTo(9.95);
    expect(clampVideoSeekTime(-1, 10)).toBe(0);
    expect(clampVideoSeekTime(5, 10)).toBe(5);
  });

  it('returns 0 when duration is missing', () => {
    expect(clampVideoSeekTime(1, 0)).toBe(0);
    expect(clampVideoSeekTime(1, Number.NaN)).toBe(0);
  });
});

describe('isFilmSeekTrivial', () => {
  it('treats very short clips as a single seek point', () => {
    expect(isFilmSeekTrivial(0)).toBe(true);
    expect(isFilmSeekTrivial(0.04)).toBe(true);
    expect(isFilmSeekTrivial(0.05)).toBe(true);
    expect(isFilmSeekTrivial(0.06)).toBe(false);
    expect(isFilmSeekTrivial(10)).toBe(false);
  });
});

describe('formatVideoTime', () => {
  it('formats as m:ss', () => {
    expect(formatVideoTime(0)).toBe('0:00');
    expect(formatVideoTime(65)).toBe('1:05');
    expect(formatVideoTime(600)).toBe('10:00');
  });
});

describe('film selector linear mapping', () => {
  const duration = 10;
  const trackWidth = 400;
  const selW = 64;
  const maxLeft = trackWidth - selW; // 336
  const maxSeek = 9.95;

  it('maps start/end time to track edges so the selector can reach the right', () => {
    expect(timeToFilmSelectorLeft(0, duration, trackWidth, selW)).toBe(0);
    expect(
      timeToFilmSelectorLeft(maxSeek, duration, trackWidth, selW),
    ).toBeCloseTo(maxLeft);
    expect(
      timeToFilmSelectorLeft(duration, duration, trackWidth, selW),
    ).toBeCloseTo(maxLeft);
  });

  it('round-trips left ↔ time', () => {
    for (const left of [0, maxLeft / 2, maxLeft]) {
      const t = filmSelectorLeftToTime(left, duration, trackWidth, selW);
      expect(timeToFilmSelectorLeft(t, duration, trackWidth, selW)).toBeCloseTo(
        left,
      );
    }
  });

  it('samples thumb times with the same track mapping as the selector', () => {
    const widths = [36, 36, 36, 36, 36, 36];
    const t0 = filmThumbSampleTime(0, widths, duration, trackWidth, selW);
    const tMid = filmThumbSampleTime(5, widths, duration, trackWidth, selW);
    expect(t0).toBeCloseTo(
      filmTrackXToTime(widths[0]! / 2, duration, trackWidth, selW),
    );
    expect(tMid).toBeCloseTo(
      filmTrackXToTime(5 * 36 + 18, duration, trackWidth, selW),
    );
    expect(t0).toBeLessThan(tMid);
  });

  it('keeps trivial clips at time 0 for every thumb cell', () => {
    expect(filmThumbSampleTime(0, [40], 0.04, trackWidth, selW)).toBe(0);
    expect(filmThumbSampleTime(3, [40, 40, 40, 40], 0.04, trackWidth, selW)).toBe(
      0,
    );
  });
});

describe('filmstripCellLayout', () => {
  it('fills the track exactly without leftover gap or overflow', () => {
    const trackWidth = 400;
    const { count, widths } = filmstripCellLayout(trackWidth, 48, 3 / 4, 10);
    expect(count).toBeGreaterThan(0);
    expect(widths).toHaveLength(count);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(trackWidth);
  });

  it('uses a single full-width cell for trivial clips', () => {
    const { count, widths } = filmstripCellLayout(320, 48, 4 / 3, 0.04);
    expect(count).toBe(1);
    expect(widths).toEqual([320]);
  });
});
