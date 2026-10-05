import { ToutiaoRewardField } from "./ToutiaoRewardField";
import type {
  ArticleAccountSettings,
  ToutiaoArticleDeclaration,
} from "@shared/article-settings";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ArticleRadioField } from "./ArticleRadioField";
import type { PlatformId } from "@/lib/api";
import { cn } from "@/lib/utils";

const declarations: { value: ToutiaoArticleDeclaration; label: string }[] = [
  { value: "internet", label: "取材网络" },
  { value: "platform", label: "引用站内" },
  { value: "opinion", label: "个人观点，仅供参考" },
  { value: "ai", label: "引用AI" },
  { value: "fiction", label: "虚构演绎，故事经历" },
  { value: "investment", label: "投资观点，仅供参考" },
  { value: "health", label: "健康医疗分享，仅供参考" },
];

export function ArticlePlatformSettingsFields({
  accountId,
  platform,
  value = {},
  disabled,
  onChange,
}: {
  accountId: string;
  platform: PlatformId;
  value?: ArticleAccountSettings;
  disabled?: boolean;
  onChange: (value: ArticleAccountSettings) => void;
}) {
  const patch = (partial: Partial<ArticleAccountSettings>) => {
    onChange({ ...value, ...partial });
  };
  const booleanField = (
    key: "original" | "exclusive" | "allowReward" | "syncToMicroPost",
    label: string,
    fallback = false,
  ) => (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <Checkbox
        id={`article-${accountId}-${key}`}
        disabled={disabled}
        checked={value[key] ?? fallback}
        onCheckedChange={(checked) => {
          patch({ [key]: checked });
        }}
      />
      <FieldLabel
        htmlFor={`article-${accountId}-${key}`}
        className="font-normal"
      >
        {label}
      </FieldLabel>
    </Field>
  );
  if (platform === "douyin") {
    const count = Array.from(value.summary ?? "").length;
    return (
      <Field data-invalid={count > 30 || undefined}>
        <FieldLabel
          htmlFor={`article-${accountId}-summary`}
          className="font-normal"
        >
          文章摘要
        </FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`article-${accountId}-summary`}
            value={value.summary ?? ""}
            disabled={disabled}
            aria-invalid={count > 30 || undefined}
            aria-describedby={
              count > 30 ? `article-${accountId}-summary-error` : undefined
            }
            placeholder="选填"
            onChange={(event) => {
              patch({ summary: event.target.value });
            }}
          />
          <InputGroupAddon align="inline-end" className="pointer-events-none">
            <span
              className={cn(
                "text-xs tabular-nums",
                count > 30 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {count}/30
            </span>
          </InputGroupAddon>
        </InputGroup>
        {count > 30 ? (
          <FieldError id={`article-${accountId}-summary-error`}>
            摘要最多 30 字
          </FieldError>
        ) : null}
      </Field>
    );
  }
  if (platform === "bilibili") {
    return (
      <>
        <FieldSet>
          <FieldLegend variant="label" className="font-normal">
            评论
          </FieldLegend>
          <FieldGroup className="flex-row flex-wrap gap-x-6 gap-y-3">
            <Field
              orientation="horizontal"
              className="w-auto"
              data-disabled={disabled || undefined}
            >
              <Checkbox
                id={`article-${accountId}-comments`}
                disabled={disabled}
                checked={value.comments !== "closed"}
                onCheckedChange={(checked) => {
                  patch({ comments: checked ? "open" : "closed" });
                }}
              />
              <FieldLabel
                htmlFor={`article-${accountId}-comments`}
                className="font-normal"
              >
                允许评论
              </FieldLabel>
            </Field>
            <Field
              orientation="horizontal"
              className="w-auto"
              data-disabled={
                disabled || value.comments === "closed" || undefined
              }
            >
              <Checkbox
                id={`article-${accountId}-selected-comments`}
                disabled={disabled || value.comments === "closed"}
                checked={value.comments === "selected"}
                onCheckedChange={(checked) => {
                  patch({ comments: checked ? "selected" : "open" });
                }}
              />
              <FieldLabel
                htmlFor={`article-${accountId}-selected-comments`}
                className="font-normal"
              >
                精选评论
              </FieldLabel>
            </Field>
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label" className="font-normal">
            作品声明
          </FieldLegend>
          <FieldGroup className="gap-3">
            {booleanField("original", "声明原创，未经授权禁止转载")}
          </FieldGroup>
        </FieldSet>
      </>
    );
  }
  if (platform === "toutiao") {
    return (
      <>
        <ArticleRadioField
          id={`article-${accountId}-advertisement`}
          label="投放广告"
          value={value.advertisement ? "yes" : "no"}
          disabled={disabled}
          options={[
            { value: "yes", label: "投放广告赚收益" },
            { value: "no", label: "不投放广告" },
          ]}
          onChange={(next) => {
            patch({ advertisement: next === "yes" });
          }}
        />
        <FieldSet>
          <FieldLegend variant="label" className="font-normal">
            声明首发
          </FieldLegend>
          <FieldGroup className="gap-3">
            {booleanField("exclusive", "头条首发")}
            {value.exclusive ? (
              <FieldDescription className="text-xs">
                首发要求 72 小时内仅在头条发布，请确认其他平台的发布时间。
              </FieldDescription>
            ) : null}
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label" className="font-normal">
            发文特权
          </FieldLegend>
          <FieldGroup className="gap-3">
            <ToutiaoRewardField
              accountId={accountId}
              checked={value.allowReward ?? true}
              disabled={disabled}
              onChange={(allowReward) => {
                patch({ allowReward });
              }}
            />
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label" className="font-normal">
            同时发布微头条
          </FieldLegend>
          <FieldGroup className="gap-3">
            {booleanField("syncToMicroPost", "发布得更多收益", true)}
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label" className="font-normal">
            作品声明
          </FieldLegend>
          <FieldGroup className="flex-row flex-wrap gap-x-6 gap-y-3">
            {declarations.map((item) => (
              <Field
                key={item.value}
                orientation="horizontal"
                className="w-auto max-w-full"
                data-disabled={disabled || undefined}
              >
                <Checkbox
                  id={`article-${accountId}-declaration-${item.value}`}
                  disabled={disabled}
                  checked={value.declarations?.includes(item.value) ?? false}
                  onCheckedChange={(checked) => {
                    const selected = new Set(value.declarations ?? []);
                    if (checked) {
                      selected.add(item.value);
                    } else {
                      selected.delete(item.value);
                    }
                    patch({
                      declarations: declarations
                        .filter((entry) => selected.has(entry.value))
                        .map((entry) => entry.value),
                    });
                  }}
                />
                <FieldLabel
                  htmlFor={`article-${accountId}-declaration-${item.value}`}
                  className="font-normal"
                >
                  {item.label}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      </>
    );
  }
  return null;
}
