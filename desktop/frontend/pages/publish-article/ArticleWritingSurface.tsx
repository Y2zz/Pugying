import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useOptionalDesktopWindowChrome } from '@/components/DesktopWindowChrome';
import { DesktopTitleBar } from '@/components/layouts/DesktopTitleBar';

/** 移动同一个编辑区域，切换专注模式时不重新挂载正文或图片节点。 */
export function ArticleWritingSurface({
  focused,
  onFocusedChange,
  children,
}: {
  focused: boolean;
  onFocusedChange: (focused: boolean) => void;
  children: ReactNode;
}) {
  const desktop = useOptionalDesktopWindowChrome();
  const [host] = useState(() => {
    const element = document.createElement('div');
    element.className = 'flex min-h-0 flex-1 flex-col';
    return element;
  });
  const inlineRef = useRef<HTMLDivElement>(null);
  const attachInline = useCallback(
    (element: HTMLDivElement | null) => {
      inlineRef.current = element;
      if (element && !focused) {
        element.appendChild(host);
      }
    },
    [focused, host],
  );
  const attachFocused = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        element.appendChild(host);
      }
    },
    [host],
  );

  useLayoutEffect(() => {
    if (!focused) {
      inlineRef.current?.appendChild(host);
    }
  }, [focused, host]);

  return (
    <>
      <div ref={attachInline} hidden={focused} />
      {createPortal(children, host)}
      <Dialog open={focused} onOpenChange={onFocusedChange}>
        <DialogContent
          className="inset-0 flex h-svh max-h-svh max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-background p-0 ring-0 duration-0 sm:max-w-none data-open:animate-none data-closed:animate-none"
          showCloseButton={false}
          initialFocus={() =>
            host.querySelector<HTMLElement>('[data-slot="rich-text-control"]')
          }
          finalFocus={() =>
            host.querySelector<HTMLButtonElement>('[aria-label="专注写作"]')
          }
        >
          {desktop?.chrome?.controls === 'trafficLights' ? (
            <div
              aria-hidden="true"
              className="desktop-titlebar-drag w-full shrink-0"
              style={{ height: 'var(--desktop-titlebar-height, 0px)' }}
            />
          ) : null}
          <DesktopTitleBar />
          <DialogTitle className="sr-only">专注写作</DialogTitle>
          <div ref={attachFocused} className="flex min-h-0 flex-1 flex-col" />
        </DialogContent>
      </Dialog>
    </>
  );
}
