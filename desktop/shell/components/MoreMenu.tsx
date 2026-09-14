import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { Button } from '@shell/components/ui/button';
import { Separator } from '@shell/components/ui/separator';
import {
  getChromeShell,
  type ChromeState,
  type MoreMenuAnchor,
} from '@shell/lib/chrome-api';

const CARD_WIDTH = 224;
const EDGE = 8;
const ANCHOR_GAP = 4;

/**
 * Modal overlay rendered in a WebContentsView covering the whole window.
 * The card is positioned next to the anchor pushed from the main process;
 * clicking the backdrop or pressing Escape closes the menu.
 */
export function MoreMenu() {
  const api = getChromeShell();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [kind, setKind] = useState<'auth' | 'browse'>('auth');
  const [anchor, setAnchor] = useState<MoreMenuAnchor | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const offState = api.onState((state: ChromeState) => {
      if (typeof state.zoomFactor === 'number') {
        setZoomFactor(state.zoomFactor);
      }
      if (state.kind) {
        setKind(state.kind);
      }
    });
    const offAnchor = api.onMenuAnchor(setAnchor);
    void api.menuReady();
    return () => {
      offState();
      offAnchor();
    };
  }, [api]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void api.closeMoreMenu();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [api]);

  // Clamp the card into the viewport once its real size is measurable.
  useLayoutEffect(() => {
    if (!anchor) {
      setPos(null);
      return;
    }
    const height = cardRef.current?.offsetHeight ?? 0;
    setPos({
      left: Math.max(
        EDGE,
        Math.min(
          Math.round(anchor.x - CARD_WIDTH),
          window.innerWidth - CARD_WIDTH - EDGE,
        ),
      ),
      top: Math.max(
        EDGE,
        Math.min(
          Math.round(anchor.y + ANCHOR_GAP),
          window.innerHeight - height - EDGE,
        ),
      ),
    });
  }, [anchor]);

  const zoomPct = Math.round(zoomFactor * 100);

  return (
    <div
      className="relative h-full w-full bg-transparent"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          void api.closeMoreMenu();
        }
      }}
    >
      <div
        ref={cardRef}
        role="menu"
        style={{
          width: CARD_WIDTH,
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
        }}
        className="absolute flex flex-col rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <div className="flex items-center justify-between gap-2 px-1 pl-2">
          <span className="text-xs font-medium text-muted-foreground">
            缩放
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="缩小"
              aria-label="缩小"
              onClick={() => {
                void api.zoomOut();
              }}
            >
              <MinusIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="恢复 100%"
              aria-label="恢复实际大小"
              className="w-14 tabular-nums"
              onClick={() => {
                void api.zoomReset();
              }}
            >
              {zoomPct}%
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="放大"
              aria-label="放大"
              onClick={() => {
                void api.zoomIn();
              }}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>
        <Separator className="my-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            // Main closes this menu and hands the flow to the toolbar,
            // whose toast tracks the operation's promise.
            void api.requestClearCache();
          }}
        >
          清除缓存
        </Button>
        {kind === 'auth' ? (
          <>
            <Separator className="my-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                void (async () => {
                  await api.closeMoreMenu();
                  await api.guideShowBubbles();
                })();
              }}
            >
              查看操作指引
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
