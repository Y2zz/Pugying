import {
  AGENT_WS_URL,
  agentClient,
  type AgentConnectionStatus,
  type AgentHelloPayload,
  type CreatorWindowClosedEvent,
} from '@/lib/agent-client';

type FakeListener = (event: { data?: string }) => void;

/**
 * Minimal in-memory WebSocket double. Tests drive the server side through the
 * `server*` helpers; frames sent by the client are captured in `sent`.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState: number = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<FakeListener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: FakeListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', {});
  }

  serverOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }

  serverMessage(data: unknown): void {
    this.emit('message', {
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
  }

  serverClose(): void {
    this.close();
  }

  private emit(type: string, event: { data?: string }): void {
    const set = this.listeners.get(type);
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      listener(event);
    }
  }
}

interface SentFrame {
  type: string;
  id?: string;
  payload?: Record<string, unknown>;
}

function sentFrames(socket: FakeWebSocket): SentFrame[] {
  return socket.sent.map((raw) => JSON.parse(raw) as SentFrame);
}

const savedWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');

function connectAndOpen(): FakeWebSocket {
  agentClient.connect();
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  socket.serverOpen();
  return socket;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  Object.defineProperty(globalThis, 'WebSocket', {
    value: FakeWebSocket,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  // Clears sockets and any pending reconnect timer on the shared singleton.
  agentClient.disconnect();
  if (savedWebSocket) {
    Object.defineProperty(globalThis, 'WebSocket', savedWebSocket);
  } else {
    Reflect.deleteProperty(globalThis, 'WebSocket');
  }
});

describe('connection lifecycle', () => {
  it('connects to the agent URL and reports status transitions', () => {
    const statuses: AgentConnectionStatus[] = [];
    const unsubscribe = agentClient.subscribeStatus((status) => {
      statuses.push(status);
    });

    expect(statuses).toEqual(['disconnected']);

    agentClient.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe(AGENT_WS_URL);
    expect(statuses).toEqual(['disconnected', 'connecting']);

    FakeWebSocket.instances[0].serverOpen();
    expect(statuses).toEqual(['disconnected', 'connecting', 'connected']);
    expect(agentClient.getStatus()).toBe('connected');

    unsubscribe();
    agentClient.disconnect();
    expect(statuses).toHaveLength(3);
  });

  it('does not open a second socket while one is active', () => {
    agentClient.connect();
    agentClient.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0].serverOpen();
    agentClient.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('resets status and hello when the server closes the connection', () => {
    const socket = connectAndOpen();
    socket.serverMessage({
      type: 'agent.hello',
      payload: { version: '0.1.0', capabilities: ['platform.auth'] },
    });
    expect(agentClient.getHello()?.version).toBe('0.1.0');

    socket.serverClose();

    expect(agentClient.getStatus()).toBe('disconnected');
    expect(agentClient.getHello()).toBeNull();
  });

  it('disconnect closes the socket intentionally', () => {
    const socket = connectAndOpen();

    agentClient.disconnect();

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(agentClient.getStatus()).toBe('disconnected');
  });
});

describe('incoming messages', () => {
  it('stores the agent.hello payload and notifies subscribers', () => {
    const seen: (AgentHelloPayload | null)[] = [];
    const unsubscribe = agentClient.subscribeHello((hello) => {
      seen.push(hello);
    });
    expect(seen).toEqual([null]);

    const socket = connectAndOpen();
    socket.serverMessage({
      type: 'agent.hello',
      payload: { version: '1.2.3', capabilities: ['platform.auth', 'platform.open'] },
    });

    expect(agentClient.getHello()).toEqual({
      version: '1.2.3',
      capabilities: ['platform.auth', 'platform.open'],
    });
    expect(seen[seen.length - 1]?.version).toBe('1.2.3');
    unsubscribe();
  });

  it('ignores malformed frames without crashing', () => {
    const socket = connectAndOpen();

    socket.serverMessage('this is not json');
    socket.serverMessage({ payload: { version: 'x' } });
    socket.serverMessage({ type: 42 });

    expect(agentClient.getStatus()).toBe('connected');
    expect(agentClient.getHello()).toBeNull();
  });

  it('notifies creator-window-closed subscribers only for valid payloads', () => {
    const events: CreatorWindowClosedEvent[] = [];
    const unsubscribe = agentClient.subscribeCreatorWindowClosed((event) => {
      events.push(event);
    });

    const socket = connectAndOpen();
    socket.serverMessage({
      type: 'platform.open.closed',
      payload: { accountId: 'acc-1', platform: 'douyin', cookies: [{ name: 'sid', value: '1' }] },
    });
    expect(events).toHaveLength(1);
    expect(events[0].accountId).toBe('acc-1');

    // Missing accountId → dropped.
    socket.serverMessage({
      type: 'platform.open.closed',
      payload: { platform: 'douyin', cookies: [] },
    });
    expect(events).toHaveLength(1);

    unsubscribe();
    socket.serverMessage({
      type: 'platform.open.closed',
      payload: { accountId: 'acc-2', platform: 'douyin', cookies: [] },
    });
    expect(events).toHaveLength(1);
  });
});

describe('ping', () => {
  it('resolves false when the agent is not connected', async () => {
    await expect(agentClient.ping()).resolves.toBe(false);
  });

  it('resolves true for a matching pong and ignores foreign ids', async () => {
    const socket = connectAndOpen();

    const pending = agentClient.ping();
    const frame = sentFrames(socket)[0];
    expect(frame.type).toBe('agent.ping');
    expect(typeof frame.id).toBe('string');

    // A pong with a different id must not resolve this ping.
    socket.serverMessage({ type: 'agent.pong', id: 'some-other-id' });
    socket.serverMessage({ type: 'agent.pong', id: frame.id });

    await expect(pending).resolves.toBe(true);
  });
});

describe('startPlatformAuth', () => {
  it('rejects when the agent is not connected', async () => {
    await expect(agentClient.startPlatformAuth({ platform: 'douyin' })).rejects.toThrow('Agent 未连接');
  });

  it('sends the auth request and resolves the matching result', async () => {
    const socket = connectAndOpen();

    const pending = agentClient.startPlatformAuth({
      platform: 'douyin',
      loginUrl: 'https://example.com/login',
      requestId: 'auth-req-1',
    });

    const frame = sentFrames(socket)[0];
    expect(frame.type).toBe('platform.auth.start');
    expect(frame.payload).toEqual({
      requestId: 'auth-req-1',
      platform: 'douyin',
      loginUrl: 'https://example.com/login',
    });

    // A result for another request is ignored.
    socket.serverMessage({
      type: 'platform.auth.result',
      payload: { requestId: 'other', ok: false },
    });
    socket.serverMessage({
      type: 'platform.auth.result',
      payload: {
        requestId: 'auth-req-1',
        ok: true,
        platform: 'douyin',
        cookies: [{ name: 'sessionid', value: 'abc' }],
        source: 'auto',
      },
    });

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.cookies).toEqual([{ name: 'sessionid', value: 'abc' }]);
  });

  it('rejects on timeout and sends a cancel frame', async () => {
    const socket = connectAndOpen();

    await expect(
      agentClient.startPlatformAuth({
        platform: 'douyin',
        requestId: 'auth-req-2',
        timeoutMs: 20,
      }),
    ).rejects.toThrow('授权超时');

    const cancel = sentFrames(socket).find((frame) => frame.type === 'platform.auth.cancel');
    expect(cancel?.payload).toEqual({ requestId: 'auth-req-2' });
  });

  it('cancelPlatformAuth sends a cancel frame while connected and is a no-op otherwise', async () => {
    const socket = connectAndOpen();
    await agentClient.cancelPlatformAuth('req-x');
    expect(sentFrames(socket)[0]).toEqual({
      type: 'platform.auth.cancel',
      payload: { requestId: 'req-x' },
    });

    agentClient.disconnect();
    await expect(agentClient.cancelPlatformAuth('req-y')).resolves.toBeUndefined();
  });
});

describe('openCreatorCenter', () => {
  it('rejects when the agent is not connected', async () => {
    await expect(
      agentClient.openCreatorCenter({ accountId: 'acc-1', platform: 'douyin', cookies: [] }),
    ).rejects.toThrow('Agent 未连接');
  });

  it('sends the open request and resolves the matching result', async () => {
    const socket = connectAndOpen();

    const pending = agentClient.openCreatorCenter({
      accountId: 'acc-1',
      platform: 'douyin',
      displayName: '测试账号',
      url: 'https://creator.example.com',
      cookies: [{ name: 'sid', value: '1' }],
    });

    const frame = sentFrames(socket)[0];
    expect(frame.type).toBe('platform.open.start');
    const requestId = frame.payload?.requestId as string;
    expect(requestId.startsWith('open-')).toBe(true);
    expect(frame.payload).toEqual({
      requestId,
      accountId: 'acc-1',
      platform: 'douyin',
      displayName: '测试账号',
      url: 'https://creator.example.com',
      cookies: [{ name: 'sid', value: '1' }],
    });

    socket.serverMessage({
      type: 'platform.open.result',
      payload: { requestId, accountId: 'acc-1', ok: true, status: 'opened' },
    });

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(result.status).toBe('opened');
  });

  it('rejects with a descriptive error on timeout', async () => {
    connectAndOpen();

    await expect(
      agentClient.openCreatorCenter({
        accountId: 'acc-1',
        platform: 'douyin',
        cookies: [],
        timeoutMs: 20,
      }),
    ).rejects.toThrow('打开创作者中心超时');
  });
});
