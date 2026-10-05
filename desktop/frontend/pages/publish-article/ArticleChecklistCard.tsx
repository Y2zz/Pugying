import type { ComponentProps } from "react";
import { PublishingChecklistBar } from "@/components/publishing/PublishingChecklistBar";
import type { ArticleCheck } from "./use-article-composer";
export function ArticleChecklistBar(
  props: ComponentProps<typeof PublishingChecklistBar<ArticleCheck>>,
) {
  return <PublishingChecklistBar {...props} />;
}
