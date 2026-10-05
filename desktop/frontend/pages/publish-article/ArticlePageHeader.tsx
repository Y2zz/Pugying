import type { ComponentProps } from "react";
import { PublishingPageHeader } from "@/components/publishing/PublishingPageHeader";
import { ArticleChecklistBar } from "./ArticleChecklistCard";
import type { ArticleCheck } from "./use-article-composer";

export function ArticlePageHeader(
  props: Omit<
    ComponentProps<typeof PublishingPageHeader<ArticleCheck>>,
    "renderChecks"
  >,
) {
  return (
    <PublishingPageHeader
      {...props}
      surfaceSlot="article-page-header-surface"
      renderChecks={(onFix) => (
        <ArticleChecklistBar checks={props.checks} onFix={onFix} />
      )}
    />
  );
}
