export type AgentConnectionStatus = "connected" | "disconnected" | "connecting";

export type AgentMessageType =
  | "agent.hello"
  | "agent.ping"
  | "agent.pong"
  | "platform.auth.start"
  | "platform.auth.progress"
  | "platform.auth.result"
  | "platform.auth.cancel"
  | "platform.open.start"
  | "platform.open.result"
  | "platform.open.closed"
  | "platform.publish.start"
  | "platform.publish.progress"
  | "platform.publish.result"
  | "platform.publish.cancel"
  | "error";

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
  source?: "auto" | "manual";
  profile?: AgentProfile;
}

export type PlatformAuthProgressPhase =
  "window_opened" | "awaiting_login" | "finishing";

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
  status?: "opened" | "focused";
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
  | "accepted"
  | "fetching_media"
  | "opening_creator"
  | "uploading"
  | "submitting"
  | "done";

export interface PlatformPublishStartInput {
  targetId: string;
  platform: string;
  accountId: string;
  /** 缺省 video；图文传 article */
  contentType?: "video" | "article" | "graphic";
  /** 视频本机路径；图文可省略 */
  mediaPath?: string;
  /** 图文多图本机路径 */
  mediaPaths?: string[];
  coverPath: string;
  /** 横封面；图文可不传 */
  coverLandscapePath?: string;
  articleCoverPaths?: string[];
  title: string;
  body?: string;
  tags?: string[];
  articleSettings?: import("@shared/article-settings").ArticleAccountSettings;
  bilibiliVideoSettings?: import("@shared/bilibili-video-settings").BilibiliVideoSettings;
  authorDeclaration?: import("@shared/douyin-graphic-settings").DouyinAuthorDeclaration;
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

/** 业务窗 preload 注入的桥（与授权壳 chromeShell 隔离） */
export type PugyingDesktopBridge = {
  getDistributionSnapshot?: () => Promise<
    import("@shared/distribution").DistributionSnapshot
  >;
  onDistributionChanged?: (callback: () => void) => () => void;
  submitDistribution?: (
    input: import("@shared/distribution").DistributionSubmission,
  ) => Promise<import("@shared/distribution").DistributionSubmissionResult>;
  getDistributionConcurrency?: () => Promise<number>;
  setDistributionConcurrency?: (value: number) => Promise<number>;
  available: true;
  getBilibiliVideoOptions?: (
    accountId: string,
  ) => Promise<
    import("@shared/bilibili-video-settings").BilibiliVideoOptions | null
  >;
  postMessage: (message: unknown) => void;
  onMessage: (callback: (message: unknown) => void) => () => void;
  getToutiaoRewardPrivilege?: (
    accountId: string,
  ) => Promise<
    import("@shared/toutiao-article-privileges").ToutiaoRewardPrivilege | null
  >;
  getApiBaseUrl?: () => Promise<string>;
  getLocalApiToken?: () => Promise<string>;
  getWindowChrome?: () => Promise<
    import("@shared/window-chrome").DesktopWindowChromeInfo
  >;
  setTitleBarOverlay?: (
    theme: import("@shared/window-chrome").TitleBarOverlayTheme,
  ) => Promise<boolean>;
  showAppWindow?: () => Promise<void>;
  quitApp?: () => Promise<void>;
  showAbout?: () => Promise<void>;
  toggleDevTools?: () => Promise<boolean>;
  /** 本机绝对路径是否可读；非 Electron 或未注入时缺省 */
  checkLocalPathReadable?: (absPath: string) => Promise<boolean>;
  /** 读取本机图片供编辑器预览；失败时返回 null */
  readLocalImageDataUrl?: (absPath: string) => Promise<string | null>;
  /** 编辑后的正文图片另存；用户取消时返回 null */
  saveArticleImage?: (
    dataUrl: string,
    sourcePath: string,
  ) => Promise<string | null>;
  /** Electron 32+：从 File 取本机绝对路径（选片/拖拽通用） */
  getPathForFile?: (file: File) => string;
};

type StatusListener = (status: AgentConnectionStatus) => void;
type HelloListener = (hello: AgentHelloPayload | null) => void;
type CreatorClosedListener = (event: CreatorWindowClosedEvent) => void;
type PublishProgressListener = (event: PlatformPublishProgress) => void;
type EnvelopeListener = (message: AgentEnvelope) => void;

function parse(raw: string): AgentEnvelope | null {
  try {
    const data = JSON.parse(raw) as AgentEnvelope;
    if (!data || typeof data.type !== "string") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function coerceEnvelope(raw: unknown): AgentEnvelope | null {
  if (typeof raw === "string") {
    return parse(raw);
  }
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as AgentEnvelope).type === "string"
  ) {
    return raw as AgentEnvelope;
  }
  return null;
}

/** 桌面一体：主窗 preload 注入；纯浏览器为 undefined */
export function getPugyingDesktopBridge(): PugyingDesktopBridge | null {
  const root =
    typeof globalThis !== "undefined"
      ? (globalThis as typeof globalThis & {
          window?: Window & { pugyingDesktop?: PugyingDesktopBridge };
          pugyingDesktop?: PugyingDesktopBridge;
        })
      : null;
  if (!root) {
    return null;
  }
  const bridge =
    root.pugyingDesktop ??
    root.window?.pugyingDesktop ??
    (typeof window !== "undefined"
      ? (window as Window & { pugyingDesktop?: PugyingDesktopBridge })
          .pugyingDesktop
      : undefined);
  if (
    bridge?.available === true &&
    typeof bridge.postMessage === "function" &&
    typeof bridge.onMessage === "function"
  ) {
    return bridge;
  }
  return null;
}

class AgentClient {
  private transport: "none" | "ipc" = "none";
  private desktopUnsub: (() => void) | null = null;
  private status: AgentConnectionStatus = "disconnected";
  private hello: AgentHelloPayload | null = null;
  private readonly statusListeners = new Set<StatusListener>();
  private readonly helloListeners = new Set<HelloListener>();
  private readonly creatorClosedListeners = new Set<CreatorClosedListener>();
  private readonly publishProgressListeners =
    new Set<PublishProgressListener>();
  private readonly envelopeListeners = new Set<EnvelopeListener>();
  private pingSeq = 0;

  getStatus(): AgentConnectionStatus {
    return this.status;
  }

  getHello(): AgentHelloPayload | null {
    return this.hello;
  }

  /** 是否运行在已注入业务 preload 的桌面主窗内 */
  isDesktopShell(): boolean {
    return getPugyingDesktopBridge() !== null;
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
    const desktop = getPugyingDesktopBridge();
    if (desktop) {
      this.connectIpc(desktop);
      return;
    }
    this.setHello(null);
    this.setStatus("disconnected");
  }

  disconnect(): void {
    if (this.desktopUnsub) {
      this.desktopUnsub();
      this.desktopUnsub = null;
    }
    this.transport = "none";
    this.setHello(null);
    this.setStatus("disconnected");
  }

  ping(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isTransportOpen()) {
        resolve(false);
        return;
      }

      const id = `ping-${++this.pingSeq}`;
      const cleanup = this.onEnvelope((message) => {
        if (message.type === "agent.pong" && message.id === id) {
          cleanup();
          clearTimeout(timer);
          resolve(true);
        }
      });
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 3000);

      this.sendEnvelope({ type: "agent.ping", id });
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
      if (!this.isTransportOpen()) {
        reject(new Error("应用未就绪"));
        return;
      }

      const requestId = input.requestId ?? createId("auth");
      const messageId = createId("msg");
      const timeoutMs = input.timeoutMs ?? 10 * 60 * 1000;

      const cleanup = this.onEnvelope((message) => {
        if (message.type === "platform.auth.progress") {
          const progress = message.payload as PlatformAuthProgress | undefined;
          if (progress?.requestId === requestId) {
            input.onProgress?.(progress);
          }
          return;
        }
        if (message.type !== "platform.auth.result") {
          return;
        }
        const payload = message.payload as PlatformAuthResult | undefined;
        if (!payload || payload.requestId !== requestId) {
          return;
        }
        cleanup();
        clearTimeout(timer);
        resolve(payload);
      });

      const timer = setTimeout(() => {
        cleanup();
        void this.cancelPlatformAuth(requestId);
        reject(new Error("授权超时"));
      }, timeoutMs);

      this.sendEnvelope({
        type: "platform.auth.start",
        id: messageId,
        payload: {
          requestId,
          platform: input.platform,
          loginUrl: input.loginUrl,
        },
      });
    });
  }

  cancelPlatformAuth(requestId: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isTransportOpen()) {
        resolve();
        return;
      }
      this.sendEnvelope({
        type: "platform.auth.cancel",
        payload: { requestId },
      });
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
      if (!this.isTransportOpen()) {
        reject(new Error("应用未就绪"));
        return;
      }

      const requestId = createId("open");
      const messageId = createId("msg");
      const timeoutMs = input.timeoutMs ?? 30 * 1000;

      const cleanup = this.onEnvelope((message) => {
        if (message.type !== "platform.open.result") {
          return;
        }
        const payload = message.payload as PlatformOpenResult | undefined;
        if (!payload || payload.requestId !== requestId) {
          return;
        }
        cleanup();
        clearTimeout(timer);
        resolve(payload);
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("打开创作者中心超时"));
      }, timeoutMs);

      this.sendEnvelope({
        type: "platform.open.start",
        id: messageId,
        payload: {
          requestId,
          accountId: input.accountId,
          platform: input.platform,
          displayName: input.displayName,
          url: input.url,
          cookies: input.cookies,
        },
      });
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
      if (!this.isTransportOpen()) {
        reject(new Error("应用未就绪"));
        return;
      }

      const requestId = createId("pub");
      const messageId = createId("msg");
      const timeoutMs = options?.timeoutMs ?? 15 * 60 * 1000;

      const cleanup = this.onEnvelope((message) => {
        if (message.type !== "platform.publish.result") {
          return;
        }
        const payload = message.payload as PlatformPublishResult | undefined;
        if (!payload || payload.requestId !== requestId) {
          return;
        }
        cleanup();
        clearTimeout(timer);
        resolve(payload);
      });

      const timer = setTimeout(() => {
        cleanup();
        void this.cancelPublish(requestId);
        reject(new Error("发布超时"));
      }, timeoutMs);

      this.sendEnvelope({
        type: "platform.publish.start",
        id: messageId,
        payload: {
          requestId,
          targetId: input.targetId,
          platform: input.platform,
          accountId: input.accountId,
          contentType: input.contentType,
          mediaPath: input.mediaPath,
          mediaPaths: input.mediaPaths,
          coverPath: input.coverPath,
          coverLandscapePath: input.coverLandscapePath,
          articleCoverPaths: input.articleCoverPaths,
          title: input.title,
          body: input.body,
          tags: input.tags,
          authorDeclaration: input.authorDeclaration,
          articleSettings: input.articleSettings,
          bilibiliVideoSettings: input.bilibiliVideoSettings,
          visibility: input.visibility,
          scheduledAt: input.scheduledAt,
          allowDownload: input.allowDownload,
          cookies: input.cookies,
        },
      });
    });
  }

  cancelPublish(requestId: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isTransportOpen()) {
        resolve();
        return;
      }
      this.sendEnvelope({
        type: "platform.publish.cancel",
        payload: { requestId },
      });
      resolve();
    });
  }

  private connectIpc(desktop: PugyingDesktopBridge): void {
    if (this.transport === "ipc" && this.desktopUnsub) {
      return;
    }
    this.setStatus("connecting");
    this.transport = "ipc";
    this.desktopUnsub = desktop.onMessage((raw) => {
      const message = coerceEnvelope(raw);
      if (!message) {
        return;
      }
      this.handleIncoming(message);
    });
    // hello 可能在订阅前被主进程推过；首 ping 触发 IPC 侧补发 hello
    this.setStatus("connected");
    this.sendEnvelope({ type: "agent.ping", id: "ipc-hello-sync" });
  }

  private handleIncoming(message: AgentEnvelope): void {
    if (message.type === "agent.hello") {
      this.setHello((message.payload as AgentHelloPayload) ?? null);
    }
    if (message.type === "platform.open.closed") {
      const payload = message.payload as CreatorWindowClosedEvent | undefined;
      if (payload?.accountId) {
        for (const listener of this.creatorClosedListeners) {
          listener(payload);
        }
      }
    }
    if (message.type === "platform.publish.progress") {
      const payload = message.payload as PlatformPublishProgress | undefined;
      if (payload?.requestId) {
        for (const listener of this.publishProgressListeners) {
          listener(payload);
        }
      }
    }
    for (const listener of this.envelopeListeners) {
      listener(message);
    }
  }

  private onEnvelope(listener: EnvelopeListener): () => void {
    this.envelopeListeners.add(listener);
    return () => {
      this.envelopeListeners.delete(listener);
    };
  }

  private isTransportOpen(): boolean {
    if (this.transport === "ipc") {
      return this.desktopUnsub !== null && this.status === "connected";
    }
    return false;
  }

  private sendEnvelope(message: AgentEnvelope): void {
    if (this.transport === "ipc") {
      getPugyingDesktopBridge()?.postMessage(message);
      return;
    }
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
