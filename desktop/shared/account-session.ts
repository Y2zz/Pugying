/**
 * 账号登录状态检测结果（主进程只读检测，renderer 展示）。
 * - valid：登录有效
 * - expiring：登录有效，但会话 Cookie 将在 3 天内到期
 * - invalid：已确认失效（用户信息接口明确返回未登录）
 * - unknown：网络失败等无法判断，不改变账号状态
 */
export type AccountSessionState = "valid" | "expiring" | "invalid" | "unknown";

export interface AccountSessionHealth {
  accountId: string;
  state: AccountSessionState;
  /** 会话 Cookie 预计到期时间（ISO）；无法估计时为 null */
  expiresAt: string | null;
  checkedAt: string;
}

/** 距到期少于该时长视为「即将过期」 */
export const ACCOUNT_EXPIRING_WITHIN_MS = 3 * 24 * 60 * 60 * 1000;
/** 同一账号两次实际检测的最小间隔 */
export const ACCOUNT_CHECK_THROTTLE_MS = 10 * 60 * 1000;
