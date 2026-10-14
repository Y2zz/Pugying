/**
 * 本机平台能力桥：授权 / 打开创作者中心 / 发布。
 * WS 与业务窗 IPC 共用同一套会话与广播，避免两套状态机分叉。
 */
import {
  cancelAuthJob,
  startAuthBrowser,
  startCreatorBrowser,
} from './auth-browser';
import { cancelPublishJob, isPublishBusy, startPublishJob } from './publish-job';
import {
  AGENT_VERSION,
  type AgentEnvelope,
  type PlatformAuthProgressPayload,
  type PlatformAuthResultPayload,
  type PlatformAuthStartPayload,
  type PlatformOpenClosedPayload,
  type PlatformOpenResultPayload,
  type PlatformOpenStartPayload,
  type PlatformPublishProgressPayload,
  type PlatformPublishResultPayload,
  type PlatformPublishStartPayload,
} from './protocol';

export interface BridgeClient {
  id: string;
  send: (message: AgentEnvelope) => void;
}

const clients = new Map<string, BridgeClient>();
/** requestId -> clients waiting for auth/publish result */
const pendingAuth = new Map<string, Set<string>>();
const pendingPublish = new Map<string, Set<string>>();

export function getBridgeClientCount(): number {
  return clients.size;
}

export function buildHelloPayload() {
  return {
    version: AGENT_VERSION,
    capabilities: [
      'ping',
      'platform.auth.start',
      'platform.auth.progress',
      'platform.auth.cancel',
      'platform.open.start',
      'platform.publish.start',
      'platform.publish.progress',
      'platform.publish.cancel',
    ],
    busy: {
      publish: isPublishBusy(),
    },
  };
}

function sendToClient(clientId: string, message: AgentEnvelope): void {
  clients.get(clientId)?.send(message);
}

function broadcastToWaiters(
  waiterIds: Set<string> | undefined,
  message: AgentEnvelope,
  fallbackAll: boolean,
): void {
  if (waiterIds && waiterIds.size > 0) {
    for (const id of waiterIds) {
      sendToClient(id, message);
    }
    return;
  }
  if (fallbackAll) {
    for (const client of clients.values()) {
      client.send(message);
    }
  }
}

function broadcastAuthResult(
  requestId: string,
  messageId: string | undefined,
  result: PlatformAuthResultPayload,
): void {
  const waiters = pendingAuth.get(requestId);
  const payloadMsg: AgentEnvelope = {
    type: 'platform.auth.result',
    id: messageId,
    payload: result,
  };
  if (waiters) {
    for (const id of waiters) {
      sendToClient(id, payloadMsg);
    }
    pendingAuth.delete(requestId);
  } else {
    for (const client of clients.values()) {
      client.send(payloadMsg);
    }
  }
}

function broadcastAuthProgress(progress: PlatformAuthProgressPayload): void {
  broadcastToWaiters(
    pendingAuth.get(progress.requestId),
    { type: 'platform.auth.progress', payload: progress },
    true,
  );
}

function broadcastOpenClosed(payload: PlatformOpenClosedPayload): void {
  const message: AgentEnvelope = {
    type: 'platform.open.closed',
    payload,
  };
  for (const client of clients.values()) {
    client.send(message);
  }
}

function broadcastPublishProgress(
  progress: PlatformPublishProgressPayload,
): void {
  broadcastToWaiters(
    pendingPublish.get(progress.requestId),
    { type: 'platform.publish.progress', payload: progress },
    true,
  );
}

function broadcastPublishResult(
  requestId: string,
  messageId: string | undefined,
  result: PlatformPublishResultPayload,
): void {
  const waiters = pendingPublish.get(requestId);
  const payloadMsg: AgentEnvelope = {
    type: 'platform.publish.result',
    id: messageId,
    payload: result,
  };
  if (waiters) {
    for (const id of waiters) {
      sendToClient(id, payloadMsg);
    }
    pendingPublish.delete(requestId);
  } else {
    for (const client of clients.values()) {
      client.send(payloadMsg);
    }
  }
  broadcastAgentHello();
}

export function broadcastAgentHello(): void {
  const payload = buildHelloPayload();
  for (const client of clients.values()) {
    client.send({ type: 'agent.hello', payload });
  }
}

/**
 * 注册桥接客户端（WS 连接或业务窗 webContents）。
 * @param options.greet 默认 true；IPC 应在渲染进程订阅后再 sync，故 attach 时传 false。
 */
export function registerBridgeClient(
  client: BridgeClient,
  options?: { greet?: boolean },
): () => void {
  clients.set(client.id, client);
  if (options?.greet !== false) {
    client.send({
      type: 'agent.hello',
      payload: buildHelloPayload(),
    });
  }

  return () => {
    clients.delete(client.id);
    for (const [requestId, waiters] of pendingAuth) {
      waiters.delete(client.id);
      if (waiters.size === 0) {
        pendingAuth.delete(requestId);
      }
    }
    for (const [requestId, waiters] of pendingPublish) {
      waiters.delete(client.id);
      if (waiters.size === 0) {
        pendingPublish.delete(requestId);
      }
    }
  };
}

/** 处理来自任一传输层的协议消息（与历史 WS 协议一致） */
export function handleBridgeMessage(
  clientId: string,
  message: AgentEnvelope,
): void {
  if (!clients.has(clientId)) {
    return;
  }

  if (message.type === 'agent.ping') {
    sendToClient(clientId, { type: 'agent.pong', id: message.id });
    // IPC：渲染进程订阅后首 ping 顺带补发 hello，避免 attach 时推送丢失
    if (clientId.startsWith('ipc:')) {
      sendToClient(clientId, {
        type: 'agent.hello',
        payload: buildHelloPayload(),
      });
    }
    return;
  }

  if (message.type === 'platform.auth.cancel') {
    const payload = message.payload as { requestId?: string } | undefined;
    const requestId = payload?.requestId ?? '';
    void cancelAuthJob(requestId, (result) => {
      broadcastAuthResult(requestId, message.id, result);
    }).then((ok) => {
      if (!ok) {
        sendToClient(clientId, {
          type: 'platform.auth.result',
          id: message.id,
          payload: {
            requestId,
            ok: false,
            error: 'not_found',
          },
        });
      }
    });
    return;
  }

  if (message.type === 'platform.auth.start') {
    const payload = message.payload as PlatformAuthStartPayload | undefined;
    const requestId = payload?.requestId?.trim();
    const platform = payload?.platform?.trim();
    if (!requestId || !platform) {
      sendToClient(clientId, {
        type: 'platform.auth.result',
        id: message.id,
        payload: {
          requestId: requestId ?? '',
          ok: false,
          error: 'invalid_payload',
        },
      });
      return;
    }

    let waiters = pendingAuth.get(requestId);
    if (!waiters) {
      waiters = new Set();
      pendingAuth.set(requestId, waiters);
    }
    waiters.add(clientId);

    const started = startAuthBrowser({
      requestId,
      platform,
      loginUrl: payload?.loginUrl,
      onResult: (result) => {
        broadcastAuthResult(requestId, message.id, result);
      },
      onProgress: (phase) => {
        broadcastAuthProgress({ requestId, platform, phase });
      },
    });

    if ('error' in started) {
      pendingAuth.delete(requestId);
      sendToClient(clientId, {
        type: 'platform.auth.result',
        id: message.id,
        payload: {
          requestId,
          ok: false,
          error: started.error,
          platform,
        },
      });
    }
    return;
  }

  if (message.type === 'platform.open.start') {
    const payload = message.payload as PlatformOpenStartPayload | undefined;
    const requestId = payload?.requestId?.trim() ?? '';
    const accountId = payload?.accountId?.trim() ?? '';
    const platform = payload?.platform?.trim() ?? '';
    const cookies = Array.isArray(payload?.cookies) ? payload.cookies : [];
    const reply = (extra: Partial<PlatformOpenResultPayload>) => {
      sendToClient(clientId, {
        type: 'platform.open.result',
        id: message.id,
        payload: {
          requestId,
          accountId,
          platform,
          ok: false,
          ...extra,
        },
      });
    };

    if (!requestId || !accountId || !platform || cookies.length === 0) {
      reply({ error: 'invalid_payload' });
      return;
    }

    void startCreatorBrowser({
      requestId,
      accountId,
      platform,
      displayName: payload?.displayName,
      url: payload?.url,
      cookies,
      onClosed: (closed) => {
        broadcastOpenClosed(closed);
      },
    }).then((result) => {
      if ('error' in result) {
        reply({ error: result.error });
        return;
      }
      reply({ ok: true, status: result.status });
    });
    return;
  }

  if (message.type === 'platform.publish.cancel') {
    const payload = message.payload as { requestId?: string } | undefined;
    const requestId = payload?.requestId ?? '';
    const ok = cancelPublishJob(requestId);
    if (!ok) {
      sendToClient(clientId, {
        type: 'platform.publish.result',
        id: message.id,
        payload: {
          requestId,
          targetId: '',
          ok: false,
          error: 'not_found',
        },
      });
    } else {
      broadcastAgentHello();
    }
    return;
  }

  if (message.type === 'platform.publish.start') {
    const payload = message.payload as PlatformPublishStartPayload | undefined;
    const requestId = payload?.requestId?.trim() ?? '';
    const targetId = payload?.targetId?.trim() ?? '';
    const reply = (extra: Partial<PlatformPublishResultPayload>) => {
      sendToClient(clientId, {
        type: 'platform.publish.result',
        id: message.id,
        payload: {
          requestId,
          targetId,
          ok: false,
          ...extra,
        },
      });
    };

    if (!payload || !requestId || !targetId) {
      reply({ error: 'invalid_payload' });
      return;
    }

    let waiters = pendingPublish.get(requestId);
    if (!waiters) {
      waiters = new Set();
      pendingPublish.set(requestId, waiters);
    }
    waiters.add(clientId);

    const started = startPublishJob({
      payload,
      onProgress: (progress) => {
        broadcastPublishProgress(progress);
      },
      onResult: (result) => {
        broadcastPublishResult(requestId, message.id, result);
      },
    });

    if ('error' in started) {
      pendingPublish.delete(requestId);
      reply({
        error: started.error,
        platform: payload.platform,
      });
    } else {
      broadcastAgentHello();
    }
  }
}
