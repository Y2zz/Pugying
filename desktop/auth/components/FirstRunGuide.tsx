import { useEffect, useState } from 'react';
import { Button } from '@auth/components/ui/button';
import {
  Card,
  CardContent,
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
  if (!slide) {
    return null;
  }

  return (
    <div className="flex size-full items-center justify-center bg-black/45 p-6">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-guide-title"
        aria-describedby="auth-guide-description"
        className="w-full max-w-md"
      >
        <CardHeader>
          <CardTitle id="auth-guide-title">{slide.title}</CardTitle>
          <CardDescription id="auth-guide-description">
            {slide.body}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>若未自动完成，可点击右上角「完成授权」。</p>
          <p className="text-muted-foreground">
            登录信息仅用于蒲公英绑定账号。
          </p>
        </CardContent>
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
            autoFocus
            onClick={() => void api.guideFinishFirstRun()}
          >
            开始登录
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
