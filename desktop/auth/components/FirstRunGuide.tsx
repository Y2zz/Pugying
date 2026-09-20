import { useEffect, useState } from 'react';
import { Badge } from '@auth/components/ui/badge';
import { Button } from '@auth/components/ui/button';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@auth/components/ui/card';
import { getChromeShell, type GuidePayload } from '@auth/lib/chrome-api';

/**
 * 首次授权引导：独立 WebContentsView 全窗遮罩，不能套 Dialog，
 * 因此用标准 Card 组合模拟 Dialog 内容结构。
 */
export function FirstRunGuide() {
  const api = getChromeShell();
  const [guide, setGuide] = useState<GuidePayload | null>(null);

  useEffect(() => {
    // 先订阅再 ready：避免首包 push 落在 listener 注册前
    const off = api.onGuide((payload) => {
      if (payload.kind === 'first-run') {
        setGuide(payload);
      }
    });
    void api.guideReady();
    return off;
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{slide.title}</CardTitle>
          <CardDescription>{slide.body}</CardDescription>
          <CardAction>
            <Badge variant="secondary">
              首次指引 · {guide.slideIndex + 1}/{guide.slides.length}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void api.guideSkipFirstRun()}
          >
            跳过
          </Button>
          <Button
            type="button"
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
