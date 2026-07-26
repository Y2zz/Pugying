import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getChromeShell, type ChromeState } from '@/lib/chrome-api';

export interface AuthToolbarProps {
  /**
   * 'auth' — one-shot authorization window with 「取消 / 完成授权」;
   * 'browse' — creator-center browsing window: no auth actions, the window
   * closes like a normal browser and the main process syncs cookies back.
   */
  variant?: 'auth' | 'browse';
}

export function AuthToolbar({ variant = 'auth' }: AuthToolbarProps) {
  const isBrowse = variant === 'browse';
  const api = getChromeShell();
  const moreBtnRef = useRef<HTMLSpanElement | null>(null);
  const completeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [url, setUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  useEffect(() => {
    return api.onState((state: ChromeState) => {
      if (state.url != null) {
        setUrl(state.url);
      }
      if (typeof state.canGoBack === 'boolean') {
        setCanGoBack(state.canGoBack);
      }
      if (typeof state.canGoForward === 'boolean') {
        setCanGoForward(state.canGoForward);
      }
      if (state.title && !isBrowse) {
        // Browse windows keep the account label set by the main process so
        // users can tell multiple creator-center windows apart.
        document.title = state.title;
      }
    });
  }, [api, isBrowse]);

  // The guide bubble is a separate WebContentsView positioned by the main
  // process, so it cannot measure this button itself. Report the real rect
  // (and re-report on any reflow) so the arrow can line up with the button.
  useEffect(() => {
    if (isBrowse) {
      // No 「完成授权」 button (and no guides) in browse mode.
      return;
    }
    const report = () => {
      const el = completeBtnRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return;
      }
      void api.reportCompleteAnchor({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    report();
    const raf = requestAnimationFrame(report);
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    if (completeBtnRef.current) {
      observer.observe(completeBtnRef.current);
    }
    window.addEventListener('resize', report);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [api, isBrowse]);

  const openMoreMenu = () => {
    const el = moreBtnRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    void api.openMoreMenu({
      x: rect.right,
      y: rect.bottom,
    });
  };

  return (
    <div className="flex h-full flex-col bg-muted/40">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canGoBack}
            title="后退"
            aria-label="后退"
            onClick={() => void api.back()}
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canGoForward}
            title="前进"
            aria-label="前进"
            onClick={() => void api.forward()}
          >
            <ArrowRightIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="刷新（Shift=硬刷新）"
            aria-label="刷新"
            onClick={(e) => void api.reload(e.shiftKey)}
          >
            <RefreshCwIcon />
          </Button>
        </div>

        <div
          title={url}
          aria-label="当前页面地址"
          className="flex h-8 min-w-0 flex-1 items-center rounded-full border border-input bg-background px-3 text-sm text-muted-foreground"
        >
          <span className="truncate select-all">{url}</span>
        </div>

        <span ref={moreBtnRef} className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            onClick={openMoreMenu}
          >
            <MoreHorizontalIcon />
          </Button>
        </span>

        {isBrowse ? null : (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void api.cancel()}
            >
              取消
            </Button>
            <Button
              ref={completeBtnRef}
              type="button"
              size="sm"
              onClick={() => void api.complete()}
            >
              完成授权
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
