import { useEffect, useState } from 'react';
import { Badge } from '@shell/components/ui/badge';
import { Button } from '@shell/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shell/components/ui/card';
import { getChromeShell, type GuidePayload } from '@shell/lib/chrome-api';

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
    <div className="flex size-full items-center justify-center bg-black/45 p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <Badge variant="secondary">
            首次指引 · {guide.slideIndex + 1}/{guide.slides.length}
          </Badge>
          <CardTitle>{slide.title}</CardTitle>
          <CardDescription>{slide.body}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-between gap-2">
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
        </CardFooter>
      </Card>
    </div>
  );
}
