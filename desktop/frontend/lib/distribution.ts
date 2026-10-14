import type {
  DistributionBatchResult,
  DistributionTargetRef,
} from "@shared/distribution";
import { getPugyingDesktopBridge } from "./agent-client";

/** 仅等待主进程接受任务；执行及结果保存与 renderer 生命周期无关。 */
export async function submitDistribution(
  contentId: string,
  targetId?: string,
): Promise<void> {
  const bridge = getPugyingDesktopBridge();
  if (!bridge?.submitDistribution) {
    throw new Error("应用未就绪，请重启后再试");
  }
  const result = await bridge.submitDistribution({ contentId, targetId });
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function cancelDistribution(
  target: DistributionTargetRef,
): Promise<void> {
  const bridge = getPugyingDesktopBridge();
  if (!bridge?.cancelDistribution) {
    throw new Error("重启应用后可取消排队任务");
  }
  const result = await bridge.cancelDistribution(target);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export async function retryDistributions(
  targets: DistributionTargetRef[],
): Promise<DistributionBatchResult> {
  const bridge = getPugyingDesktopBridge();
  if (!bridge?.retryDistributions) {
    throw new Error("重启应用后可批量重新发布");
  }
  return bridge.retryDistributions(targets);
}
