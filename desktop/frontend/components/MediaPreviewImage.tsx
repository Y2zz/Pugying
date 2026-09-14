import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  fetchMediaSignedUrl,
  parseMediaAssetId,
} from '@/lib/api';

interface MediaPreviewImageProps {
  /** 本机媒体库路径 `/media/assets/{id}`、裸 UUID、http(s)、或 blob: */
  src: string | null | undefined;
  alt?: string;
  className?: string;
  /** 预览容器比例，如 3/4 或 16/9；与固定高度 class 二选一即可 */
  aspectRatio?: number;
  /** 图片适应方式，默认 cover */
  objectFit?: 'cover' | 'contain';
}

/**
 * 渲染封面预览：blob/http 直出；本机媒体库资产走短时签名 URL。
 * 图片绝对定位填满容器，避免竖图固有高度撑破 aspect-ratio / 固定高度。
 */
export function MediaPreviewImage({
  src,
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

    const run = async () => {
      setFailed(false);
      setImageReady(false);
      if (!src?.trim()) {
        setDisplayUrl(null);
        setResolving(false);
        return;
      }
      const value = src.trim();
      if (
        value.startsWith('blob:') ||
        value.startsWith('data:') ||
        /^https?:\/\//i.test(value)
      ) {
        setDisplayUrl(value);
        setResolving(false);
        return;
      }
      const assetId = parseMediaAssetId(value);
      if (!assetId) {
        setDisplayUrl(null);
        setFailed(true);
        setResolving(false);
        return;
      }
      setResolving(true);
      setDisplayUrl(null);
      try {
        const signed = await fetchMediaSignedUrl(assetId);
        if (!cancelled) {
          setDisplayUrl(signed.url);
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
    };
  }, [src]);

  const showSkeleton = resolving || (Boolean(displayUrl) && !failed && !imageReady);
  const empty = !src?.trim() && !resolving && !failed;

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
