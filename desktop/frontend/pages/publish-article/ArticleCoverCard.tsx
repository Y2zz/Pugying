import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import type { CoverKind } from '@/lib/api';
import { ArticleCoverThumb } from './ArticleCoverThumb';
import { COVER_ASPECT_LABEL, coverSlotReady, type CoverPair } from './helpers';
import type { CoverNeed } from './use-article-composer';

/**
 * 通用封面：放在正文之后、分发之前。
 * 先定默认封面，账号表单里再覆盖；槽位随已选平台增减（未选账号时先给可选双槽）。
 */
export function ArticleCoverCard({
  sectionRef,
  needs,
  covers,
  hasAccounts,
  canUseFirstImage,
  disabled,
  onEdit,
  onUseFirstImage,
}: {
  sectionRef?: RefObject<HTMLElement | null>;
  needs: CoverNeed[];
  covers: CoverPair;
  hasAccounts: boolean;
  canUseFirstImage: boolean;
  disabled?: boolean;
  onEdit: (aspect: CoverKind) => void;
  onUseFirstImage: () => void;
}) {
  const allReady = needs.every((need) => coverSlotReady(covers[need.aspect]));

  return (
    <section ref={sectionRef} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-medium tracking-tight">封面</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasAccounts
              ? '默认用于所有账号；个别账号可在分发里单独更换'
              : '可先设置；选定账号后会按平台要求收紧比例'}
          </p>
        </div>
        {canUseFirstImage && !allReady ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onUseFirstImage}>
            用正文首图
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {needs.map((need) => (
          <div key={need.aspect} className="flex min-w-0 flex-col gap-2">
            <ArticleCoverThumb
              aspect={need.aspect}
              src={covers[need.aspect].previewUrl}
              disabled={disabled}
              className="h-32"
              onClick={() => {
                onEdit(need.aspect);
              }}
            />
            <div className="flex flex-col gap-0.5 text-xs">
              <span className="font-medium">
                {COVER_ASPECT_LABEL[need.aspect]}
                {hasAccounts ? (
                  need.required ? null : (
                    <span className="font-normal text-muted-foreground"> · 可选</span>
                  )
                ) : (
                  <span className="font-normal text-muted-foreground"> · 待定</span>
                )}
              </span>
              {need.platformLabels.length > 0 ? (
                <span
                  className="max-w-40 truncate text-muted-foreground"
                  title={need.platformLabels.join('、')}
                >
                  {need.platformLabels.join('、')}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
