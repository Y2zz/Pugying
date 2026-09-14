import { authBubbleSteps, firstRunSlides } from './guide';

describe('firstRunSlides', () => {
  it('returns the three-slide intro in order', () => {
    const slides = firstRunSlides('抖音');
    expect(slides).toHaveLength(3);
    expect(slides.map((slide) => slide.id)).toEqual([
      'welcome',
      'login',
      'finish',
    ]);
  });

  it('interpolates the platform name into the welcome slide', () => {
    const slides = firstRunSlides('哔哩哔哩');
    expect(slides[0].body).toContain('哔哩哔哩');
  });

  it('gives every slide a non-empty title and body', () => {
    for (const slide of firstRunSlides('抖音')) {
      expect(slide.title.length).toBeGreaterThan(0);
      expect(slide.body.length).toBeGreaterThan(0);
    }
  });

  it('produces independent arrays per call', () => {
    const first = firstRunSlides('a');
    const second = firstRunSlides('a');
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe('authBubbleSteps', () => {
  it('returns two steps anchored to content then complete', () => {
    const steps = authBubbleSteps('抖音');
    expect(steps).toHaveLength(2);
    expect(steps.map((step) => step.anchor)).toEqual(['content', 'complete']);
    expect(steps.map((step) => step.id)).toEqual(['login-page', 'complete']);
  });

  it('interpolates the platform name into the login step', () => {
    const steps = authBubbleSteps('小红书');
    expect(steps[0].body).toContain('小红书');
  });
});
