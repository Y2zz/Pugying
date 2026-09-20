import { useEffect, useState } from 'react';
import { XIcon } from 'lucide-react';
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
import { CHROME_HEIGHT } from '@shared/ipc';

const CARD_WIDTH = 400;
const EDGE = 12;
const ARROW_SIZE = 12;
/** Keep the arrow clear of the card's rounded corners */
const ARROW_INSET = 28;
/** Gap between the anchored control and the card */
const ANCHOR_GAP = 8;

interface CardPlacement {
  left: number;
  top: number | null; // null = vertically centered in the content region
  arrowLeft: number | null;
}

/**
 * 操作气泡：全窗 WebContentsView 遮罩，不能套 Popover/HoverCard。
 * 内容区用标准 Card 组合；箭头仅为锚点定位所需的最小自定义。
 */
export function StepBubble() {
  const api = getChromeShell();
  const [guide, setGuide] = useState<GuidePayload | null>(null);

  useEffect(() => {
    // 先订阅再 ready：结束首次指引切到气泡时，主进程可能立刻 push
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
  const isLast = guide.stepIndex >= guide.steps.length - 1;
  if (!step) {
    return null;
  }

  const placeCard = (): CardPlacement => {
    const winW = window.innerWidth;
    const maxLeft = Math.max(EDGE, winW - CARD_WIDTH - EDGE);
    if (step.anchor !== 'complete') {
      return {
        left: Math.round(
          Math.min(maxLeft, Math.max(EDGE, winW / 2 - CARD_WIDTH / 2)),
        ),
        top: null,
        arrowLeft: null,
      };
    }

    const rect = guide.completeAnchor;
    // Fallback guesses only apply before the toolbar's first report.
    const targetX = rect ? rect.x + rect.width / 2 : winW - EDGE - 44;
    const targetBottom = rect ? rect.y + rect.height : 40;

    // Prefer hugging the right edge, then slide just enough that the arrow
    // can still reach the button without leaving the card's corners.
    let left = maxLeft;
    const minArrow = ARROW_INSET;
    const maxArrow = CARD_WIDTH - ARROW_INSET;
    if (targetX - left > maxArrow) {
      left = targetX - maxArrow;
    } else if (targetX - left < minArrow) {
      left = targetX - minArrow;
    }
    left = Math.round(Math.min(maxLeft, Math.max(EDGE, left)));

    return {
      left,
      top: Math.round(targetBottom + ANCHOR_GAP),
      arrowLeft: Math.round(
        Math.min(maxArrow, Math.max(minArrow, targetX - left)) - ARROW_SIZE / 2,
      ),
    };
  };

  const { left, top, arrowLeft } = placeCard();
  const anchoredUp = step.anchor === 'complete';

  return (
    <div className="relative size-full bg-black/30">
      <Card
        style={{
          width: CARD_WIDTH,
          left,
          ...(top == null
            ? {
                // centre within the content region below the toolbar
                top: `calc(50% + ${CHROME_HEIGHT / 2}px)`,
                transform: 'translateY(-50%)',
              }
            : { top }),
        }}
        className="absolute overflow-visible"
      >
        {anchoredUp && arrowLeft != null ? (
          <span
            className="absolute -top-1.5 size-3 rotate-45 border-t border-l border-foreground/10 bg-card"
            style={{ left: arrowLeft }}
            aria-hidden
          />
        ) : null}
        <CardHeader>
          <CardTitle>{step.title}</CardTitle>
          <CardDescription>{step.body}</CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="关闭提示"
              onClick={() => void api.guideCloseBubbles()}
            >
              <XIcon />
            </Button>
          </CardAction>
        </CardHeader>
        <CardFooter className="justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void api.guideDismissBubblesForever()}
          >
            不再提示
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (isLast) {
                void api.guideCloseBubbles();
              } else {
                void api.guideNextBubble();
              }
            }}
          >
            {isLast ? '知道了' : '下一步'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
