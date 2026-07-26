import { WebSocketServer, type WebSocket } from 'ws';
import {
  cancelAuthJob,
  startAuthBrowser,
  startCreatorBrowser,
} from './auth-browser';
import {
  AGENT_VERSION,
  AGENT_WS_HOST,
  AGENT_WS_PORT,
  encodeAgentMessage,
  parseAgentMessage,
  type AgentEnvelope,
  type PlatformAuthResultPayload,
  type PlatformAuthStartPayload,
  type PlatformOpenClosedPayload,
  type PlatformOpenResultPayload,
  type PlatformOpenStartPayload,
} from './protocol';

const clients = new Set<WebSocket>();

/** requestId -> sockets waiting for result (usually one) */
const pendingAuth = new Map<string, Set<WebSocket>>();

export function getConnectedClientCount(): number {
  return clients.size;
}

function send(socket: WebSocket, message: AgentEnvelope): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(encodeAgentMessage(message));
  }
}

function broadcastResult(
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
    for (const socket of waiters) {
      send(socket, payloadMsg);
    }
    pendingAuth.delete(requestId);
  } else {
    for (const socket of clients) {
      send(socket, payloadMsg);
    }
  }
}

/**
 * Creator-center close events go to every client: the page that opened the
 * window may have navigated away or reconnected, and any authenticated
 * frontend can perform the cookie write-back.
 */
function broadcastOpenClosed(payload: PlatformOpenClosedPayload): void {
  const message: AgentEnvelope = {
    type: 'platform.open.closed',
    payload,
  };
  for (const socket of clients) {
    send(socket, message);
  }
}

export function startAgentWsServer(): WebSocketServer {
  const wss = new WebSocketServer({
    host: AGENT_WS_HOST,
    port: AGENT_WS_PORT,
  });

  wss.on('connection', (socket) => {
    clients.add(socket);
    send(socket, {
      type: 'agent.hello',
      payload: {
        version: AGENT_VERSION,
        capabilities: [
          'ping',
          'platform.auth.start',
          'platform.auth.cancel',
          'platform.open.start',
        ],
      },
    });

    socket.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      const message = parseAgentMessage(raw);
      if (!message) {
        send(socket, {
          type: 'error',
          payload: { message: 'Invalid message' },
        });
        return;
      }

      if (message.type === 'agent.ping') {
        send(socket, { type: 'agent.pong', id: message.id });
        return;
      }

      if (message.type === 'platform.auth.cancel') {
        const payload = message.payload as { requestId?: string } | undefined;
        const requestId = payload?.requestId ?? '';
        void cancelAuthJob(requestId, (result) => {
          broadcastResult(requestId, message.id, result);
        }).then((ok) => {
          if (!ok) {
            send(socket, {
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
          send(socket, {
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
        waiters.add(socket);

        const started = startAuthBrowser({
          requestId,
          platform,
          loginUrl: payload?.loginUrl,
          onResult: (result) => {
            broadcastResult(requestId, message.id, result);
          },
        });

        if ('error' in started) {
          pendingAuth.delete(requestId);
          send(socket, {
            type: 'platform.auth.result',
            id: message.id,
            payload: {
              requestId,
              ok: false,
              error: started.error,
              platform,
            },
          });
          return;
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
          send(socket, {
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
    });

    const forget = () => {
      clients.delete(socket);
      for (const [requestId, waiters] of pendingAuth) {
        waiters.delete(socket);
        if (waiters.size === 0) {
          pendingAuth.delete(requestId);
        }
      }
    };
    socket.on('close', forget);
    socket.on('error', forget);
  });

  wss.on('listening', () => {
    console.log(
      `[pugying-agent] WebSocket listening on ws://${AGENT_WS_HOST}:${AGENT_WS_PORT}`,
    );
  });

  return wss;
}
