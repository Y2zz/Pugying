import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getChromeShell, type GuidePayload } from '@/lib/chrome-api';

export function FirstRunGuide() {
  const api = getChromeShell();
  const [guide, setGuide] = useState<GuidePayload | null>(null);

  useEffect(() => {
    void api.guideReady();
    return api.onGuide((payload) => {
      if (payload.kind === 'first-run') {
        setGuide(payload);
      }
    });
  }, [api]);

  if (!guide || guide.kind !== 'first-run') {
    return null;
  }

  const slide = guide.slides[guide.slideIndex];
  const isLast = guide.slideIndex >= guide.slides.length - 1;
  if (!slide) {
    return null;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/45 p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-background p-6 shadow-lg">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            首次指引 · {guide.slideIndex + 1}/{guide.slides.length}
          </p>
          <h1 className="text-lg font-semibold tracking-tight">{slide.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {slide.body}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void api.guideSkipFirstRun()}
          >
            跳过
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (isLast) {
                void api.guideFinishFirstRun();
              } else {
                void api.guideNextFirstRun();
              }
            }}
          >
            {isLast ? '开始授权' : '下一步'}
          </Button>
        </div>
      </div>
    </div>
  );
}
