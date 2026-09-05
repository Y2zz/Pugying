import type { RefObject } from 'react';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { CoverHoverCard } from './CoverHoverCard';
import type { CoverKind } from './helpers';

/** 竖/横封面预览共用高度（横版 4:3 定高，竖版 3:4 与之对齐） */
const COVER_PREVIEW_HEIGHT_CLASS = 'h-28 shrink-0';

/** 通用信息内竖/横封面并排编辑（等高展示；点击槽位打开编辑 Dialog） */
export function CoverEditorSection({
  coverSectionRef,
  coverUrl,
  coverLandscapeUrl,
  coverPreviewUrl,
  coverLandscapePreviewUrl,
  coverHint,
  disabled,
  onEditCover,
}: {
  coverSectionRef: RefObject<HTMLDivElement | null>;
  coverUrl: string;
  coverLandscapeUrl: string;
  coverPreviewUrl: string | null;
  coverLandscapePreviewUrl: string | null;
  coverHint: string;
  disabled?: boolean;
  onEditCover: (kind: CoverKind) => void;
}) {
  return (
    <div ref={coverSectionRef}>
      <Field>
        <FieldLabel>封面</FieldLabel>
        <FieldDescription>抖音需竖版 3:4 与横版 4:3；上传视频后可自动截帧，也可点击槽位编辑</FieldDescription>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <CoverHoverCard
            label="竖版 3:4"
            ready={Boolean(coverUrl)}
            src={coverPreviewUrl || coverUrl}
            objectFit="contain"
            aspectRatio={3 / 4}
            previewClassName={COVER_PREVIEW_HEIGHT_CLASS}
            disabled={disabled}
            onEdit={() => {
              onEditCover('cover');
            }}
          />
          <CoverHoverCard
            label="横版 4:3"
            ready={Boolean(coverLandscapeUrl)}
            src={coverLandscapePreviewUrl || coverLandscapeUrl}
            aspectRatio={4 / 3}
            previewClassName={COVER_PREVIEW_HEIGHT_CLASS}
            disabled={disabled}
            onEdit={() => {
              onEditCover('cover_landscape');
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{coverHint}</p>
      </Field>
    </div>
  );
}
