import {
  clampDateTime,
  formatLocalDateTime,
  getDateTimeWindow,
  getDayTimeRange,
  isDateTimeAllowed,
  parseLocalDateTime,
} from './date-time';

const now = new Date(2026, 9, 3, 10, 15, 30).getTime();

it('rounds the earliest time up and the latest time down to selectable minutes', () => {
  const window = getDateTimeWindow({ minHours: 2, maxDays: 14 }, now);
  expect(formatLocalDateTime(window.min!)).toBe('2026-10-03T12:16');
  expect(formatLocalDateTime(window.max!)).toBe('2026-10-17T10:15');
  expect(isDateTimeAllowed(new Date(2026, 9, 3, 12, 15), window)).toBe(false);
  expect(isDateTimeAllowed(new Date(2026, 9, 3, 12, 16), window)).toBe(true);
});

it('exposes partial first and last days and disables days outside the window', () => {
  const window = getDateTimeWindow({ minHours: 2, maxDays: 14 }, now);
  expect(getDayTimeRange(new Date(2026, 9, 2), window)).toBeUndefined();
  expect(getDayTimeRange(new Date(2026, 9, 3), window)).toEqual({
    min: 12 * 60 + 16,
    max: 1439,
  });
  expect(getDayTimeRange(new Date(2026, 9, 4), window)).toEqual({
    min: 0,
    max: 1439,
  });
  expect(getDayTimeRange(new Date(2026, 9, 17), window)).toEqual({
    min: 0,
    max: 10 * 60 + 15,
  });
  expect(getDayTimeRange(new Date(2026, 9, 18), window)).toBeUndefined();
});

it('moves the earliest selectable day forward when the lead time crosses midnight', () => {
  const window = getDateTimeWindow(
    { minHours: 2, maxDays: 14 },
    new Date(2026, 9, 3, 23, 30, 1).getTime(),
  );
  expect(formatLocalDateTime(window.min!)).toBe('2026-10-04T01:31');
  expect(getDayTimeRange(new Date(2026, 9, 3), window)).toBeUndefined();
  expect(getDayTimeRange(new Date(2026, 9, 4), window)?.min).toBe(91);
});

it('intersects absolute limits and platform limits', () => {
  const window = getDateTimeWindow(
    {
      minHours: 2,
      maxDays: 14,
      min: '2026-10-04T09:00',
      max: '2026-10-05T17:30',
    },
    now,
  );
  expect(formatLocalDateTime(window.min!)).toBe('2026-10-04T09:00');
  expect(formatLocalDateTime(window.max!)).toBe('2026-10-05T17:30');
});

it('handles a narrow same-day window and clamps only to its valid endpoints', () => {
  const window = getDateTimeWindow(
    { min: '2026-10-03T12:30', max: '2026-10-03T13:05' },
    now,
  );
  expect(getDayTimeRange(new Date(2026, 9, 3), window)).toEqual({
    min: 750,
    max: 785,
  });
  expect(
    formatLocalDateTime(clampDateTime(new Date(2026, 9, 3, 10), window)!),
  ).toBe('2026-10-03T12:30');
  expect(
    formatLocalDateTime(clampDateTime(new Date(2026, 9, 3, 14), window)!),
  ).toBe('2026-10-03T13:05');
});

it('allows an unrestricted picker and rejects a window with no selectable minute', () => {
  expect(getDayTimeRange(new Date(2026, 9, 3), {})).toEqual({
    min: 0,
    max: 1439,
  });
  const window = getDateTimeWindow(
    { min: '2026-10-03T13:00', max: '2026-10-03T12:00' },
    now,
  );
  expect(getDayTimeRange(new Date(2026, 9, 3), window)).toBeUndefined();
  expect(clampDateTime(new Date(now), window)).toBeUndefined();
});

it.each([
  '2026-02-30T12:00',
  '2026-10-03T24:00',
  '2026-10-03T12:60',
  'not-a-date',
])('rejects invalid local timestamps: %s', (value) => {
  expect(parseLocalDateTime(value)).toBeUndefined();
});
