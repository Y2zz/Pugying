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
