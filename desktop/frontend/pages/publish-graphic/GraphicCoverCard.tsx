import type { ComponentProps } from "react";
import { ArticleCoverCard } from "../publish-article/ArticleCoverCard";
export function GraphicCoverCard(
  props: ComponentProps<typeof ArticleCoverCard>,
) {
  return <ArticleCoverCard {...props} firstImageLabel="用第一张图" />;
}
