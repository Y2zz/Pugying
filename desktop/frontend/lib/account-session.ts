import type { AccountSessionHealth } from "@shared/account-session";
import { getPugyingDesktopBridge } from "./agent-client";

/** 后台登录检测；不可用（浏览器预览、旧版桌面端）或失败时返回空结果，不影响页面。 */
export async function checkAccountSessions(
  ids: string[],
  options: { force?: boolean } = {},
): Promise<AccountSessionHealth[]> {
  const bridge = getPugyingDesktopBridge();
  if (!bridge?.checkAccountSessions || ids.length === 0) {
    return [];
  }
  try {
    return await bridge.checkAccountSessions(ids, options);
  } catch {
    return [];
  }
}
