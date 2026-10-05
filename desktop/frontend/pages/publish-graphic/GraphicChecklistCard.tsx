import type { ComponentProps } from "react";
import { PublishingChecklistBar } from "@/components/publishing/PublishingChecklistBar";
import type { GraphicCheck } from "./use-graphic-composer";
export function GraphicChecklistBar(
  props: ComponentProps<typeof PublishingChecklistBar<GraphicCheck>>,
) {
  return <PublishingChecklistBar {...props} />;
}
