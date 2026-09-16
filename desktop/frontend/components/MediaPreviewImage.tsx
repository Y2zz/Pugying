import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetchCoverObjectUrl, type CoverKind } from '@/lib/api';

interface MediaPreviewImageProps {
  /** 已有 blob:/data:/http(s)/file: 预览地址时优先使用 */
  src?: string | null;
  /** 无可用 src 时按内容封面接口拉取 */
  contentId?: string;
  kind?: CoverKind;
  targetId?: string;
  alt?: string;
  className?: string;
  /** 预览容器比例，如 3/4 或 16/9；与固定高度 class 二选一即可 */
  aspectRatio?: number;
  /** 图片适应方式，默认 cover */
  objectFit?: 'cover' | 'contain';
}

/**
 * 渲染封面预览：blob/http/file 直出；否则按 contentId+kind 拉取封面 object URL。
 * 图片绝对定位填满容器，避免竖图固有高度撑破 aspect-ratio / 固定高度。
 */
export function MediaPreviewImage({
  src,
  contentId,
  kind = 'portrait',
  targetId,
  alt = '',
  className,
  aspectRatio,
  objectFit = 'cover',
}: MediaPreviewImageProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let fetchedObjectUrl: string | null = null;

    const run = async () => {
      setFailed(false);
      setImageReady(false);
      const direct = src?.trim() ?? '';
      if (
        direct.startsWith('blob:') ||
        direct.startsWith('data:') ||
        /^https?:\/\//i.test(direct) ||
        direct.startsWith('file:')
      ) {
        setDisplayUrl(direct);
        setResolving(false);
        return;
      }
      if (!contentId) {
        setDisplayUrl(null);
        setFailed(Boolean(direct));
        setResolving(false);
        return;
      }
      setResolving(true);
      setDisplayUrl(null);
      try {
        const url = await fetchCoverObjectUrl(contentId, kind, targetId);
        fetchedObjectUrl = url;
        if (!cancelled) {
          setDisplayUrl(url);
        } else {
          URL.revokeObjectURL(url);
          fetchedObjectUrl = null;
        }
      } catch {
        if (!cancelled) {
          setDisplayUrl(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) {
          setResolving(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (fetchedObjectUrl) {
        URL.revokeObjectURL(fetchedObjectUrl);
      }
    };
  }, [src, contentId, kind, targetId]);

  const showSkeleton = resolving || (Boolean(displayUrl) && !failed && !imageReady);
  const empty = !src?.trim() && !contentId && !resolving && !failed;

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-md border bg-muted',
        className,
      )}
      style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
    >
      {displayUrl && !failed ? (
        <img
          src={displayUrl}
          alt={alt}
          className={cn(
            'absolute inset-0 size-full max-h-full max-w-full transition-opacity',
            // cover 默认居中裁剪；contain 完整显示（发布页竖封面等可显式传入）
            objectFit === 'contain' ? 'object-contain' : 'object-cover object-center',
            imageReady ? 'opacity-100' : 'opacity-0',
          )}
          loading="lazy"
          onLoad={() => {
            setImageReady(true);
          }}
          onError={() => {
            setFailed(true);
            setImageReady(false);
          }}
        />
      ) : null}
      {showSkeleton ? <Skeleton className="absolute inset-0 size-full rounded-none" /> : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-muted-foreground">
          预览加载失败
        </div>
      ) : null}
      {empty ? (
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-muted-foreground">
          暂无封面
        </div>
      ) : null}
    </div>
  );
}
