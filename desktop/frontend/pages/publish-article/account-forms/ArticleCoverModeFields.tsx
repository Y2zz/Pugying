import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ArticleCoverThumb } from "../ArticleCoverThumb";
import { coverSlotReady, effectiveCover, emptyCoverSlot } from "../helpers";
import { ArticleRadioField } from "./ArticleRadioField";
import {
  ArticleCoverOverrideField,
  type ArticlePlatformAccountFormProps,
  type DraftPatch,
} from "./shared-fields";

type Props = Pick<
  ArticlePlatformAccountFormProps,
  "account" | "draft" | "commonCovers" | "disabled" | "onEditCover"
> & { patch: DraftPatch };

export function ToutiaoArticleCoverField({
  account,
  draft,
  commonCovers,
  disabled,
  onEditCover,
  patch,
}: Props) {
  const mode = draft.articleSettings?.coverMode ?? "single";
  return (
    <FieldGroup className="gap-4">
      <ArticleRadioField
        id={`article-${account.id}-cover-mode`}
        label="展示封面"
        value={mode}
        disabled={disabled}
        options={[
          { value: "single", label: "单图" },
          { value: "triple", label: "三图" },
          { value: "none", label: "无封面" },
        ]}
        onChange={(value) => {
          patch({
            articleSettings: {
              ...draft.articleSettings,
              coverMode: value as "single" | "triple" | "none",
            },
          });
        }}
      />
      {mode === "single" ? (
        <ArticleCoverOverrideField
          platform="toutiao"
          draft={draft}
          commonCovers={commonCovers}
          disabled={disabled}
          onEdit={onEditCover}
          patch={patch}
        />
      ) : mode === "triple" ? (
        <div className="flex flex-wrap items-start gap-4">
          {([0, 1, 2] as const).map((index) => {
            const first = effectiveCover(draft, commonCovers, "landscape");
            const slot =
              index === 0
                ? first.slot
                : (draft.extraCovers?.[index - 1] ?? emptyCoverSlot());
            const own = index === 0 ? first.own : coverSlotReady(slot);
            return (
              <Field key={index} className="w-auto">
                <FieldTitle className="font-normal">
                  第 {index + 1} 张
                </FieldTitle>
                <ArticleCoverThumb
                  aspect="landscape"
                  label={`第${index + 1}张`}
                  src={slot.previewUrl}
                  disabled={disabled}
                  className="h-28"
                  onClick={() => {
                    onEditCover(
                      "landscape",
                      index === 0 ? undefined : index === 1 ? 0 : 1,
                    );
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {own
                    ? "单独设置"
                    : coverSlotReady(slot)
                      ? "沿用通用"
                      : "未设置"}
                </span>
                {own ? (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto w-fit px-0"
                    disabled={disabled}
                    onClick={() => {
                      if (index === 0) {
                        patch({
                          covers: {
                            ...draft.covers,
                            landscape: emptyCoverSlot(),
                          },
                        });
                      } else {
                        const extraCovers = [
                          ...(draft.extraCovers ?? [
                            emptyCoverSlot(),
                            emptyCoverSlot(),
                          ]),
                        ];
                        extraCovers[index - 1] = emptyCoverSlot();
                        patch({ extraCovers });
                      }
                    }}
                  >
                    {index === 0 ? "恢复通用" : "移除"}
                  </Button>
                ) : null}
              </Field>
            );
          })}
        </div>
      ) : null}
    </FieldGroup>
  );
}

export function BilibiliArticleCoverField({
  account,
  draft,
  commonCovers,
  disabled,
  onEditCover,
  patch,
}: Props) {
  const enabled = draft.articleSettings?.customCover ?? false;
  const id = `article-${account.id}-custom-cover`;
  return (
    <FieldGroup className="gap-3">
      <ArticleRadioField
        id={id}
        label="封面"
        value={enabled ? "custom" : "auto"}
        disabled={disabled}
        options={[
          { value: "auto", label: "自动生成" },
          { value: "custom", label: "自定义封面" },
        ]}
        onChange={(mode) => {
          patch({
            articleSettings: {
              ...draft.articleSettings,
              customCover: mode === "custom",
            },
          });
        }}
      />
      {enabled ? (
        <>
          <ArticleCoverOverrideField
            platform="bilibili"
            hideLabel
            className="w-auto"
            draft={draft}
            commonCovers={commonCovers}
            disabled={disabled}
            onEdit={onEditCover}
            patch={patch}
            isRequired={() => true}
          />
          <FieldDescription className="text-xs">
            JPG、PNG，建议不低于 600 × 336 像素
          </FieldDescription>
        </>
      ) : (
        <FieldDescription className="text-xs">
          封面由正文开头文字生成
        </FieldDescription>
      )}
    </FieldGroup>
  );
}
