import type { RefObject } from "react";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { CoverHoverCard } from "./CoverHoverCard";
import type { CoverKind } from "./helpers";

/** 竖/横封面预览共用高度（横版 4:3 定高，竖版 3:4 与之对齐） */
const COVER_PREVIEW_HEIGHT_CLASS = "h-28 shrink-0";

/** 通用信息内封面编辑（点击槽位打开编辑 Dialog）；图文可按需显示竖/横 */
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
  /** 仅横版（与 portraitOnly 互斥优先：landscapeOnly） */
  landscapeOnly = false,
  /** 图文配置轨：弱化 Field 边距与描述密度 */
  plain = false,
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
  landscapeOnly?: boolean;
  plain?: boolean;
}) {
  const showPortrait = !landscapeOnly;
  const showLandscape = !portraitOnly;

  const slots = (
    <div
      className={cn(
        "flex flex-wrap items-start gap-4",
        plain ? "mt-2" : "mt-3",
      )}
    >
      {showPortrait ? (
        <CoverHoverCard
          label="竖版 3:4"
          ready={coverReady}
          src={coverPreviewUrl}
          objectFit="contain"
          aspectRatio={3 / 4}
          previewClassName={COVER_PREVIEW_HEIGHT_CLASS}
          disabled={disabled}
          onEdit={() => {
            onEditCover("cover");
          }}
        />
      ) : null}
      {showLandscape ? (
        <CoverHoverCard
          label="横版 4:3"
          ready={coverLandscapeReady}
          src={coverLandscapePreviewUrl}
          aspectRatio={4 / 3}
          previewClassName={COVER_PREVIEW_HEIGHT_CLASS}
          disabled={disabled}
          onEdit={() => {
            onEditCover("cover_landscape");
          }}
        />
      ) : null}
    </div>
  );

  if (plain) {
    return (
      <div ref={coverSectionRef} className="flex flex-col gap-1.5">
        <div className="text-sm font-medium">封面</div>
        {slots}
        {coverHint ? (
          <p className="text-xs text-muted-foreground">{coverHint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={coverSectionRef}>
      <Field>
        <FieldTitle className="font-normal">封面</FieldTitle>
        {portraitOnly ? null : (
          <FieldDescription>
            建议设置竖版 3:4 与横版 4:3 封面；也可使用平台默认封面
          </FieldDescription>
        )}
        {slots}
        <p className="mt-2 text-xs text-muted-foreground">{coverHint}</p>
      </Field>
    </div>
  );
}
