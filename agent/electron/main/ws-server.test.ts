import { WebSocket, type WebSocketServer } from 'ws';
import { disposeAuthJob } from './auth-browser';
import {
  AGENT_WS_HOST,
  AGENT_WS_PORT,
  type AgentEnvelope,
} from './protocol';
import { getConnectedClientCount, startAgentWsServer } from './ws-server';

const WS_URL = `ws://${AGENT_WS_HOST}:${AGENT_WS_PORT}`;

let wss: WebSocketServer | null = null;

async function waitFor(
  condition: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

class TestClient {
  private socket: WebSocket;
  private queue: AgentEnvelope[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (data) => {
      this.queue.push(JSON.parse(data.toString('utf8')) as AgentEnvelope);
    });
  }

  static connect(): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(WS_URL);
      socket.once('open', () => {
        resolve(new TestClient(socket));
      });
      socket.once('error', reject);
    });
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(raw: string): void {
    this.socket.send(raw);
  }

  async next(timeoutMs = 3000): Promise<AgentEnvelope> {
    await waitFor(() => this.queue.length > 0, timeoutMs);
    const message = this.queue.shift();
    if (!message) {
      throw new Error('message queue drained unexpectedly');
    }
    return message;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }
}

beforeAll(async () => {
  const server = startAgentWsServer();
  wss = server;
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', (error: Error) => {
      reject(
        new Error(
          `无法监听 ${WS_URL}（若本机正在运行 Pugying Agent，请先退出）: ${error.message}`,
        ),
      );
    });
  });
});

afterAll(async () => {
  if (wss) {
    const server = wss;
    wss = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

describe('agent WebSocket server', () => {
  it('greets every connection with agent.hello and tracks the client count', async () => {
    const client = await TestClient.connect();
    try {
      await waitFor(() => getConnectedClientCount() === 1);
      const hello = await client.next();
      expect(hello.type).toBe('agent.hello');
      expect(hello.payload).toMatchObject({
        version: '0.0.1',
        capabilities: [
          'ping',
          'platform.auth.start',
          'platform.auth.cancel',
          'platform.open.start',
        ],
      });
    } finally {
      await client.close();
    }
    await waitFor(() => getConnectedClientCount() === 0);
  });

  it('answers unparseable input with an error envelope', async () => {
    const client = await TestClient.connect();
    try {
      await client.next(); // hello
      client.sendRaw('this is not json');
      const error = await client.next();
      expect(error).toEqual({
        type: 'error',
        payload: { message: 'Invalid message' },
      });
    } finally {
      await client.close();
    }
  });

  it('responds to agent.ping with agent.pong echoing the id', async () => {
    const client = await TestClient.connect();
    try {
      await client.next(); // hello
      client.send({ type: 'agent.ping', id: 'ping-7' });
      const pong = await client.next();
      expect(pong).toEqual({ type: 'agent.pong', id: 'ping-7' });
    } finally {
      await client.close();
    }
  });

  it('rejects platform.auth.start without requestId or platform', async () => {
    const client = await TestClient.connect();
    try {
      await client.next(); // hello
      client.send({
        type: 'platform.auth.start',
        id: 'm-invalid',
        payload: { requestId: '   ', platform: '' },
      });
      const result = await client.next();
      expect(result).toEqual({
        type: 'platform.auth.result',
        id: 'm-invalid',
        payload: { requestId: '', ok: false, error: 'invalid_payload' },
      });
    } finally {
      await client.close();
    }
  });

  it('rejects platform.auth.start for unsupported platforms', async () => {
    const client = await TestClient.connect();
    try {
      await client.next(); // hello
      client.send({
        type: 'platform.auth.start',
        id: 'm-unsup',
        payload: { requestId: 'ws-unsup-1', platform: 'myspace' },
      });
      const result = await client.next();
      expect(result).toEqual({
        type: 'platform.auth.result',
        id: 'm-unsup',
        payload: {
          requestId: 'ws-unsup-1',
          ok: false,
          error: 'unsupported_platform:myspace',
          platform: 'myspace',
        },
      });
    } finally {
      await client.close();
    }
  });

  it('reports not_found when cancelling an unknown auth job', async () => {
    const client = await TestClient.connect();
    try {
      await client.next(); // hello
      client.send({
        type: 'platform.auth.cancel',
        id: 'm-cancel',
        payload: { requestId: 'ghost-job' },
      });
      const result = await client.next();
      expect(result).toEqual({
        type: 'platform.auth.result',
        id: 'm-cancel',
        payload: { requestId: 'ghost-job', ok: false, error: 'not_found' },
      });
    } finally {
      await client.close();
    }
  });

  it('rejects platform.open.start without cookies', async () => {
    const client = await TestClient.connect();
    try {
      await client.next(); // hello
      client.send({
        type: 'platform.open.start',
        id: 'm-open-1',
        payload: {
          requestId: 'open-req-1',
          accountId: 'acc-1',
          platform: 'douyin',
          cookies: [],
        },
      });
      const result = await client.next();
      expect(result).toEqual({
        type: 'platform.open.result',
        id: 'm-open-1',
        payload: {
          requestId: 'open-req-1',
          accountId: 'acc-1',
          platform: 'douyin',
          ok: false,
          error: 'invalid_payload',
        },
      });
    } finally {
      await client.close();
    }
  });

  it('rejects platform.open.start for unsupported platforms', async () => {
    const client = await TestClient.connect();
    try {
      await client.next(); // hello
      client.send({
        type: 'platform.open.start',
        id: 'm-open-2',
        payload: {
          requestId: 'open-req-2',
          accountId: 'acc-2',
          platform: 'myspace',
          cookies: [{ name: 'a', value: 'b' }],
        },
      });
      const result = await client.next();
      expect(result).toEqual({
        type: 'platform.open.result',
        id: 'm-open-2',
        payload: {
          requestId: 'open-req-2',
          accountId: 'acc-2',
          platform: 'myspace',
          ok: false,
          error: 'unsupported_platform:myspace',
        },
      });
    } finally {
      await client.close();
    }
  });

  it('routes a started auth job through cancel back to the requester', async () => {
    const client = await TestClient.connect();
    try {
      await client.next(); // hello
      client.send({
        type: 'platform.auth.start',
        id: 'm-start',
        payload: { requestId: 'ws-int-1', platform: 'douyin' },
      });
      client.send({
        type: 'platform.auth.cancel',
        id: 'm-stop',
        payload: { requestId: 'ws-int-1' },
      });
      const result = await client.next();
      expect(result).toEqual({
        type: 'platform.auth.result',
        id: 'm-stop',
        payload: {
          requestId: 'ws-int-1',
          ok: false,
          error: 'cancelled',
          platform: 'douyin',
        },
      });
    } finally {
      await disposeAuthJob('ws-int-1');
      await client.close();
    }
  });
});
