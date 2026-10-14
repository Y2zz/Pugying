import { describe, expect, it, vi } from 'vitest';
import {
  buildHelloPayload,
  handleBridgeMessage,
  registerBridgeClient,
  type BridgeClient,
} from './desktop-bridge';
import type { AgentEnvelope } from './protocol';

vi.mock('./auth-browser', () => ({
  cancelAuthJob: vi.fn(async () => false),
  startAuthBrowser: vi.fn(() => ({ error: 'unsupported_platform:x' })),
  startCreatorBrowser: vi.fn(async () => ({ error: 'unsupported_platform:x' })),
}));

vi.mock('./publish-job', () => ({
  cancelPublishJob: vi.fn(() => false),
  isPublishBusy: vi.fn(() => false),
  startPublishJob: vi.fn(() => ({ error: 'unsupported_platform:x' })),
}));

function makeClient(): BridgeClient & { inbox: AgentEnvelope[] } {
  const inbox: AgentEnvelope[] = [];
  return {
    id: `test-${Math.random().toString(16).slice(2)}`,
    inbox,
    send: (message) => {
      inbox.push(message);
    },
  };
}

describe('desktop-bridge', () => {
  it('sends hello on register and answers ping', () => {
    const client = makeClient();
    const unregister = registerBridgeClient(client);
    try {
      expect(client.inbox[0]?.type).toBe('agent.hello');
      expect(buildHelloPayload().capabilities).toContain('platform.auth.start');

      handleBridgeMessage(client.id, { type: 'agent.ping', id: 'p1' });
      expect(client.inbox.at(-1)).toEqual({ type: 'agent.pong', id: 'p1' });
    } finally {
      unregister();
    }
  });
});
