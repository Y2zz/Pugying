import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { getPugyingDesktopBridge } from '@/lib/agent-client';
import { cn } from '@/lib/utils';
import { articleBodyPreview } from './article-body-preview';

export interface ArticlePreviewTarget {
  id: string;
  label: string;
  platform: string;
  title: string;
}

export function ArticleReadingPreview({
  title,
  body,
  targets,
  onClose,
  returnFocus,
}: {
  title: string;
  body: string;
  targets: ArticlePreviewTarget[];
  onClose: () => void;
  returnFocus?: HTMLElement;
}) {
  const [targetId, setTargetId] = useState('common');
  const [mobile, setMobile] = useState(true);
  const target = targets.find((item) => item.id === targetId);
  const formatted = useMemo(
    () => articleBodyPreview(body, target?.platform || 'common'),
    [body, target?.platform],
  );
  const [html, setHtml] = useState(formatted.html);
  useEffect(() => {
    let active = true;
    setHtml(formatted.html);
    const document = new DOMParser().parseFromString(
      formatted.html,
      'text/html',
    );
    const images = Array.from(document.body.querySelectorAll('img'));
    void Promise.all(
      images.map(async (image) => {
        const path = image.getAttribute('data-local-path');
        if (path) {
          try {
            const data =
              await getPugyingDesktopBridge()?.readLocalImageDataUrl?.(path);
            if (data) {
              image.src = data;
            } else {
              image.replaceWith(document.createTextNode('图片无法读取'));
            }
          } catch {
            image.replaceWith(document.createTextNode('图片无法读取'));
          }
        }
      }),
    ).then(() => {
      if (active) {
        setHtml(document.body.innerHTML);
      }
    });
    return () => {
      active = false;
    };
  }, [formatted.html]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100svh-3rem)] flex-col sm:max-w-4xl"
        finalFocus={() => returnFocus}
      >
        <DialogHeader>
          <DialogTitle>阅读预览</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            size="sm"
            aria-label="预览账号"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <NativeSelectOption value="common">通用稿件</NativeSelectOption>
            {targets.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            size="sm"
            aria-label="预览宽度"
            value={mobile ? 'mobile' : 'desktop'}
            onChange={(event) => setMobile(event.target.value === 'mobile')}
          >
            <NativeSelectOption value="mobile">手机宽度</NativeSelectOption>
            <NativeSelectOption value="desktop">桌面宽度</NativeSelectOption>
          </NativeSelect>
          <span className="text-xs text-muted-foreground">
            本地预览，实际效果以平台为准
          </span>
        </div>
        {formatted.simplified ? (
          <p className="text-xs text-muted-foreground">
            该平台将简化部分样式，通用稿件保留原格式。
          </p>
        ) : null}
        <div className="min-h-0 overflow-y-auto rounded-md border bg-muted/20 p-4">
          <article
            className={cn(
              'mx-auto flex flex-col gap-4 rounded-md bg-background p-5',
              mobile ? 'max-w-sm' : 'max-w-3xl',
            )}
          >
            <h1 className="break-words text-2xl font-semibold">
              {target?.title || title || '未填写标题'}
            </h1>
            <div
              className="break-words text-base leading-7 [&_p]:my-3 [&_h2]:my-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:my-3 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_img]:mx-auto [&_img]:max-w-full [&_figcaption]:text-center [&_figcaption]:text-sm [&_a]:underline [&_hr]:my-5 [&_hr]:border-border"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a')) {
                  event.preventDefault();
                }
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
