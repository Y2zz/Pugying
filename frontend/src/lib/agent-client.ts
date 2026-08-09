export const AGENT_WS_URL = 'ws://127.0.0.1:3927';

export type AgentConnectionStatus = 'connected' | 'disconnected' | 'connecting';

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
  | 'platform.publish.start'
  | 'platform.publish.progress'
  | 'platform.publish.result'
  | 'platform.publish.cancel'
  | 'error';

export interface AgentEnvelope<T = unknown> {
  type: AgentMessageType;
  id?: string;
  payload?: T;
}

export interface AgentHelloPayload {
  version: string;
  capabilities: string[];
  busy?: {
    publish?: boolean;
  };
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

/** Best-effort account profile scraped by the Agent; all fields optional. */
export interface AgentProfile {
  platformUserId?: string;
  nickname?: string;
  avatarUrl?: string;
}

export interface PlatformAuthResult {
  requestId: string;
  ok: boolean;
  error?: string;
  platform?: string;
  cookies?: AgentCookie[];
  finalUrl?: string;
  source?: 'auto' | 'manual';
  profile?: AgentProfile;
}

export type PlatformAuthProgressPhase =
  | 'window_opened'
  | 'awaiting_login'
  | 'finishing';

export interface PlatformAuthProgress {
  requestId: string;
  platform: string;
  phase: PlatformAuthProgressPhase;
}

export interface PlatformOpenResult {
  requestId: string;
  accountId: string;
  ok: boolean;
  /** 'opened' = new window, 'focused' = existing window brought to front */
  status?: 'opened' | 'focused';
  error?: string;
  platform?: string;
}

/** Pushed by the Agent when a creator-center window closes. */
export interface CreatorWindowClosedEvent {
  accountId: string;
  platform: string;
  cookies: AgentCookie[];
  finalUrl?: string;
  /** Refreshed profile, so platform-side renames propagate back */
  profile?: AgentProfile;
}

export type PlatformPublishProgressPhase =
  | 'accepted'
  | 'fetching_media'
  | 'opening_creator'
  | 'uploading'
  | 'submitting'
  | 'done';

export interface PlatformPublishStartInput {
  targetId: string;
  platform: string;
  accountId: string;
  mediaUrl: string;
  coverUrl: string;
  coverLandscapeUrl: string;
  title: string;
  body?: string;
  visibility?: string;
  scheduledAt?: string;
  allowDownload?: boolean;
  cookies: AgentCookie[];
}

export interface PlatformPublishProgress {
  requestId: string;
  targetId: string;
  platform: string;
  phase: PlatformPublishProgressPhase;
  message?: string;
}

export interface PlatformPublishResult {
  requestId: string;
  targetId: string;
  ok: boolean;
  error?: string;
  errorCode?: string;
  platform?: string;
  platformPostId?: string;
  platformUrl?: string;
}

type StatusListener = (status: AgentConnectionStatus) => void;
type HelloListener = (hello: AgentHelloPayload | null) => void;
type CreatorClosedListener = (event: CreatorWindowClosedEvent) => void;
type PublishProgressListener = (event: PlatformPublishProgress) => void;

function encode(message: AgentEnvelope): string {
  return JSON.stringify(message);
}

function parse(raw: string): AgentEnvelope | null {
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

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class AgentClient {
  private socket: WebSocket | null = null;
  private status: AgentConnectionStatus = 'disconnected';
  private hello: AgentHelloPayload | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private readonly statusListeners = new Set<StatusListener>();
  private readonly helloListeners = new Set<HelloListener>();
  private readonly creatorClosedListeners = new Set<CreatorClosedListener>();
  private readonly publishProgressListeners = new Set<PublishProgressListener>();
  private pingSeq = 0;

  getStatus(): AgentConnectionStatus {
    return this.status;
  }

  getHello(): AgentHelloPayload | null {
    return this.hello;
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeHello(listener: HelloListener): () => void {
    this.helloListeners.add(listener);
    listener(this.hello);
    return () => {
      this.helloListeners.delete(listener);
    };
  }

  /**
   * Creator-center window close events (carry refreshed cookies for the
   * write-back). Survives reconnects — the subscription is on the client,
   * not on an individual socket.
   */
  subscribeCreatorWindowClosed(listener: CreatorClosedListener): () => void {
    this.creatorClosedListeners.add(listener);
    return () => {
      this.creatorClosedListeners.delete(listener);
    };
  }

  /** Progress events for an in-flight platform.publish job. */
  subscribePublishProgress(listener: PublishProgressListener): () => void {
    this.publishProgressListeners.add(listener);
    return () => {
      this.publishProgressListeners.delete(listener);
    };
  }

  connect(): void {
    this.intentionallyClosed = false;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.setStatus('connecting');
    const socket = new WebSocket(AGENT_WS_URL);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }
      this.setStatus('connected');
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) {
        return;
      }
      const message = parse(String(event.data));
      if (!message) {
        return;
      }
      if (message.type === 'agent.hello') {
        this.setHello((message.payload as AgentHelloPayload) ?? null);
      }
      if (message.type === 'platform.open.closed') {
        const payload = message.payload as CreatorWindowClosedEvent | undefined;
        if (payload?.accountId) {
          for (const listener of this.creatorClosedListeners) {
            listener(payload);
          }
        }
      }
      if (message.type === 'platform.publish.progress') {
        const payload = message.payload as PlatformPublishProgress | undefined;
        if (payload?.requestId) {
          for (const listener of this.publishProgressListeners) {
            listener(payload);
          }
        }
      }
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.setHello(null);
      this.setStatus('disconnected');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // close handler will reconnect
    });
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setHello(null);
    this.setStatus('disconnected');
  }

  ping(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        resolve(false);
        return;
      }

      const id = `ping-${++this.pingSeq}`;
      const socket = this.socket;
      const onMessage = (event: MessageEvent) => {
        const message = parse(String(event.data));
        if (message?.type === 'agent.pong' && message.id === id) {
          socket.removeEventListener('message', onMessage);
          clearTimeout(timer);
          resolve(true);
        }
      };
      const timer = setTimeout(() => {
        socket.removeEventListener('message', onMessage);
        resolve(false);
      }, 3000);

      socket.addEventListener('message', onMessage);
      socket.send(encode({ type: 'agent.ping', id }));
    });
  }

  startPlatformAuth(input: {
    platform: string;
    loginUrl?: string;
    requestId?: string;
    timeoutMs?: number;
    onProgress?: (progress: PlatformAuthProgress) => void;
  }): Promise<PlatformAuthResult> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Agent 未连接'));
        return;
      }

      const requestId = input.requestId ?? createId('auth');
      const messageId = createId('msg');
      const socket = this.socket;
      const timeoutMs = input.timeoutMs ?? 10 * 60 * 1000;

      const cleanup = () => {
        socket.removeEventListener('message', onMessage);
        clearTimeout(timer);
      };

      const onMessage = (event: MessageEvent) => {
        const message = parse(String(event.data));
        if (!message) {
          return;
        }
        if (message.type === 'platform.auth.progress') {
          const progress = message.payload as PlatformAuthProgress | undefined;
          if (progress?.requestId === requestId) {
            input.onProgress?.(progress);
          }
          return;
        }
        if (message.type !== 'platform.auth.result') {
          return;
        }
        const payload = message.payload as PlatformAuthResult | undefined;
        if (!payload || payload.requestId !== requestId) {
          return;
        }
        cleanup();
        resolve(payload);
      };

      const timer = setTimeout(() => {
        cleanup();
        void this.cancelPlatformAuth(requestId);
        reject(new Error('授权超时'));
      }, timeoutMs);

      socket.addEventListener('message', onMessage);
      socket.send(
        encode({
          type: 'platform.auth.start',
          id: messageId,
          payload: {
            requestId,
            platform: input.platform,
            loginUrl: input.loginUrl,
          },
        }),
      );
    });
  }

  cancelPlatformAuth(requestId: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }
      this.socket.send(
        encode({
          type: 'platform.auth.cancel',
          payload: { requestId },
        }),
      );
      resolve();
    });
  }

  /**
   * Ask the Agent to open (or focus) the creator-center window of a bound
   * account. Resolves with the open result — the window itself keeps
   * running independently until the user closes it.
   */
  openCreatorCenter(input: {
    accountId: string;
    platform: string;
    displayName?: string;
    url?: string;
    cookies: AgentCookie[];
    timeoutMs?: number;
  }): Promise<PlatformOpenResult> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Agent 未连接'));
        return;
      }

      const requestId = createId('open');
      const messageId = createId('msg');
      const socket = this.socket;
      const timeoutMs = input.timeoutMs ?? 30 * 1000;

      const cleanup = () => {
        socket.removeEventListener('message', onMessage);
        clearTimeout(timer);
      };

      const onMessage = (event: MessageEvent) => {
        const message = parse(String(event.data));
        if (message?.type !== 'platform.open.result') {
          return;
        }
        const payload = message.payload as PlatformOpenResult | undefined;
        if (!payload || payload.requestId !== requestId) {
          return;
        }
        cleanup();
        resolve(payload);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('打开创作者中心超时'));
      }, timeoutMs);

      socket.addEventListener('message', onMessage);
      socket.send(
        encode({
          type: 'platform.open.start',
          id: messageId,
          payload: {
            requestId,
            accountId: input.accountId,
            platform: input.platform,
            displayName: input.displayName,
            url: input.url,
            cookies: input.cookies,
          },
        }),
      );
    });
  }

  /**
   * Ask the Agent to publish one content target (P0: Douyin video stub/adapter).
   * Resolves with the final result; progress arrives via subscribePublishProgress.
   */
  startPublish(
    input: PlatformPublishStartInput,
    options?: { timeoutMs?: number },
  ): Promise<PlatformPublishResult> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Agent 未连接'));
        return;
      }

      const requestId = createId('pub');
      const messageId = createId('msg');
      const socket = this.socket;
      const timeoutMs = options?.timeoutMs ?? 15 * 60 * 1000;

      const cleanup = () => {
        socket.removeEventListener('message', onMessage);
        clearTimeout(timer);
      };

      const onMessage = (event: MessageEvent) => {
        const message = parse(String(event.data));
        if (message?.type !== 'platform.publish.result') {
          return;
        }
        const payload = message.payload as PlatformPublishResult | undefined;
        if (!payload || payload.requestId !== requestId) {
          return;
        }
        cleanup();
        resolve(payload);
      };

      const timer = setTimeout(() => {
        cleanup();
        void this.cancelPublish(requestId);
        reject(new Error('发布超时'));
      }, timeoutMs);

      socket.addEventListener('message', onMessage);
      socket.send(
        encode({
          type: 'platform.publish.start',
          id: messageId,
          payload: {
            requestId,
            targetId: input.targetId,
            platform: input.platform,
            accountId: input.accountId,
            mediaUrl: input.mediaUrl,
            coverUrl: input.coverUrl,
            coverLandscapeUrl: input.coverLandscapeUrl,
            title: input.title,
            body: input.body,
            visibility: input.visibility,
            scheduledAt: input.scheduledAt,
            allowDownload: input.allowDownload,
            cookies: input.cookies,
          },
        }),
      );
    });
  }

  cancelPublish(requestId: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }
      this.socket.send(
        encode({
          type: 'platform.publish.cancel',
          payload: { requestId },
        }),
      );
      resolve();
    });
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  private setStatus(status: AgentConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private setHello(hello: AgentHelloPayload | null): void {
    this.hello = hello;
    for (const listener of this.helloListeners) {
      listener(hello);
    }
  }
}

export const agentClient = new AgentClient();
