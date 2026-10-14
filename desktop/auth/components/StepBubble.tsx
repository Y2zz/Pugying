import { useEffect, useState } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@auth/components/ui/button';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@auth/components/ui/card';
import { getChromeShell, type GuidePayload } from '@auth/lib/chrome-api';

/** 登录提示条使用独立的窄 WebContentsView，平台页面在其下方保持可操作。 */
export function StepBubble() {
  const api = getChromeShell();
  const [guide, setGuide] = useState<GuidePayload | null>(null);

  useEffect(() => {
    const off = api.onGuide((payload) => {
      if (payload.kind === 'bubbles') {
        setGuide(payload);
      }
    });
    void api.guideReady();
    return off;
  }, [api]);

  if (!guide || guide.kind !== 'bubbles') {
    return null;
  }

  const step = guide.steps[guide.stepIndex];
  if (!step) {
    return null;
  }

  return (
    <Card size="sm" className="h-full justify-center rounded-none">
      <CardHeader>
        <CardTitle>{step.title}</CardTitle>
        <CardDescription className="whitespace-pre-line">
          {step.body}
        </CardDescription>
        <CardAction className="flex items-center gap-2 self-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void api.guideDismissBubblesForever()}
          >
            不再提示
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="关闭提示"
            onClick={() => void api.guideCloseBubbles()}
          >
            <XIcon />
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
