import type { RefObject } from 'react';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { CoverHoverCard } from './CoverHoverCard';
import type { CoverKind } from './helpers';

/** 竖/横封面预览共用高度（横版 4:3 定高，竖版 3:4 与之对齐） */
const COVER_PREVIEW_HEIGHT_CLASS = 'h-28 shrink-0';

/** 通用信息内封面编辑（点击槽位打开编辑 Dialog）；图文可仅竖版 */
export function CoverEditorSection({
  coverSectionRef,
  coverReady,
  coverLandscapeReady,
  coverPreviewUrl,
  coverLandscapePreviewUrl,
  coverHint,
  disabled,
  onEditCover,
  portraitOnly = false,
}: {
  coverSectionRef: RefObject<HTMLDivElement | null>;
  coverReady: boolean;
  coverLandscapeReady: boolean;
  coverPreviewUrl: string | null;
  coverLandscapePreviewUrl: string | null;
  coverHint: string;
  disabled?: boolean;
  onEditCover: (kind: CoverKind) => void;
  /** 图文仅需竖版封面 */
  portraitOnly?: boolean;
}) {
  return (
    <div ref={coverSectionRef}>
      <Field>
        <FieldLabel>封面</FieldLabel>
        <FieldDescription>
          {portraitOnly
            ? '请上传图片并裁剪为竖版 3:4 封面'
            : '抖音需竖版 3:4 与横版 4:3；选择视频后可自动截帧，也可点击槽位编辑'}
        </FieldDescription>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <CoverHoverCard
            label="竖版 3:4"
            ready={coverReady}
            src={coverPreviewUrl}
            objectFit="contain"
            aspectRatio={3 / 4}
            previewClassName={COVER_PREVIEW_HEIGHT_CLASS}
            disabled={disabled}
            onEdit={() => {
              onEditCover('cover');
            }}
          />
          {!portraitOnly ? (
            <CoverHoverCard
              label="横版 4:3"
              ready={coverLandscapeReady}
              src={coverLandscapePreviewUrl}
              aspectRatio={4 / 3}
              previewClassName={COVER_PREVIEW_HEIGHT_CLASS}
              disabled={disabled}
              onEdit={() => {
                onEditCover('cover_landscape');
              }}
            />
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{coverHint}</p>
      </Field>
    </div>
  );
}
