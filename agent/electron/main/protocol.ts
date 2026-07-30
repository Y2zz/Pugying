/** Local WebSocket port — browser SPA connects to 127.0.0.1 only. */
export const AGENT_WS_PORT = 3927;
export const AGENT_WS_HOST = '127.0.0.1';
export const AGENT_VERSION = '0.0.1';

export type AgentMessageType =
  | 'agent.hello'
  | 'agent.ping'
  | 'agent.pong'
  | 'platform.auth.start'
  | 'platform.auth.progress'
  | 'platform.auth.result'
  | 'platform.auth.cancel'
  | 'platform.open.start'
  | 'platform.open.result'
  | 'platform.open.closed'
  | 'error';

export interface AgentEnvelope<T = unknown> {
  type: AgentMessageType;
  id?: string;
  payload?: T;
}

export interface AgentHelloPayload {
  version: string;
  capabilities: string[];
}

export interface PlatformAuthStartPayload {
  requestId: string;
  platform: string;
  loginUrl?: string;
}

/** Pushed while an auth window is open so the SPA can mirror progress. */
export type PlatformAuthProgressPhase =
  | 'window_opened'
  | 'awaiting_login'
  | 'finishing';

export interface PlatformAuthProgressPayload {
  requestId: string;
  platform: string;
  phase: PlatformAuthProgressPhase;
}

export interface AgentCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** Best-effort account profile scraped after login; every field optional. */
export interface AgentProfile {
  platformUserId?: string;
  nickname?: string;
  avatarUrl?: string;
}

export interface PlatformAuthResultPayload {
  requestId: string;
  ok: boolean;
  error?: string;
  platform?: string;
  cookies?: AgentCookie[];
  finalUrl?: string;
  source?: 'auto' | 'manual';
  profile?: AgentProfile;
}

/** Open a creator-center window for an already-bound account. */
export interface PlatformOpenStartPayload {
  requestId: string;
  /** Backend platform-account UUID; also keys the persist partition. */
  accountId: string;
  platform: string;
  /** Shown in the window title, e.g. 「抖音账号 · 创作者中心」 */
  displayName?: string;
  /** Creator-center entry URL; falls back to the platform adapter's loginUrl. */
  url?: string;
  /** Decrypted cookies to inject before loading the page. */
  cookies: AgentCookie[];
}

export interface PlatformOpenResultPayload {
  requestId: string;
  accountId: string;
  ok: boolean;
  /** 'opened' = new window, 'focused' = existing window brought to front */
  status?: 'opened' | 'focused';
  error?: string;
  platform?: string;
}

/** Pushed when a creator-center window closes; carries refreshed cookies. */
export interface PlatformOpenClosedPayload {
  accountId: string;
  platform: string;
  cookies: AgentCookie[];
  finalUrl?: string;
  /** Refreshed profile, so renames on the platform propagate back */
  profile?: AgentProfile;
}

export function parseAgentMessage(raw: string): AgentEnvelope | null {
  try {
    const data = JSON.parse(raw) as AgentEnvelope;
    if (!data || typeof data.type !== 'string') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function encodeAgentMessage(message: AgentEnvelope): string {
  return JSON.stringify(message);
}
