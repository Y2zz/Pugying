import { authBubbleSteps, firstRunSlides } from './guide';

describe('firstRunSlides', () => {
  it('summarizes authorization in one introduction', () => {
    const slides = firstRunSlides('抖音');
    expect(slides).toHaveLength(1);
    expect(slides.map((slide) => slide.id)).toEqual(['welcome']);
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
  it('provides one login hint without a tutorial sequence', () => {
    const steps = authBubbleSteps('抖音');
    expect(steps).toHaveLength(1);
    expect(steps.map((step) => step.anchor)).toEqual(['content']);
    expect(steps.map((step) => step.id)).toEqual(['login-page']);
  });

  it('interpolates the platform name into the login step', () => {
    const steps = authBubbleSteps('小红书');
    expect(steps[0].title).toContain('小红书');
  });
});
