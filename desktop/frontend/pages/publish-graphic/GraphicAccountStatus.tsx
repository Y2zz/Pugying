import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PlatformAccountItem } from "@/lib/api";
import {
  ACCOUNT_STATUS_TEXT,
  type ArticleOverrideDraft,
  type CoverPair,
} from "../publish-article/helpers";
import { missingRequiredGraphicCovers } from "./helpers";

export function GraphicAccountStatus({
  account,
  draft,
  commonCovers,
  issues,
}: {
  account: PlatformAccountItem;
  draft: ArticleOverrideDraft;
  commonCovers: CoverPair;
  issues: string[];
}) {
  if (account.status !== "active") {
    return (
      <Badge variant="outline" className="shrink-0">
        {ACCOUNT_STATUS_TEXT[account.status]}
      </Badge>
    );
  }
  if (issues.length > 0) {
    return (
      <Badge variant="destructive" className="shrink-0">
        {issues[0]}
      </Badge>
    );
  }
  if (
    missingRequiredGraphicCovers(draft, commonCovers, account.platform).length >
    0
  ) {
    return (
      <Badge variant="outline" className="shrink-0">
        缺封面
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="shrink-0">
      <CircleCheck data-icon="inline-start" />
      就绪
    </Badge>
  );
}
