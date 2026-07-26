import {
  AGENT_VERSION,
  AGENT_WS_HOST,
  AGENT_WS_PORT,
  encodeAgentMessage,
  parseAgentMessage,
  type AgentEnvelope,
} from './protocol';

describe('protocol constants', () => {
  it('pins the local bridge endpoint to 127.0.0.1:3927', () => {
    expect(AGENT_WS_HOST).toBe('127.0.0.1');
    expect(AGENT_WS_PORT).toBe(3927);
  });

  it('exposes a semver-shaped agent version', () => {
    expect(AGENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('encodeAgentMessage', () => {
  it('serializes type, id and payload', () => {
    const encoded = encodeAgentMessage({
      type: 'agent.pong',
      id: 'msg-1',
      payload: { hello: true },
    });
    expect(JSON.parse(encoded)).toEqual({
      type: 'agent.pong',
      id: 'msg-1',
      payload: { hello: true },
    });
  });

  it('omits absent optional fields from the JSON text', () => {
    const encoded = encodeAgentMessage({ type: 'agent.ping' });
    expect(encoded).toBe('{"type":"agent.ping"}');
  });
});

describe('parseAgentMessage', () => {
  it('round-trips an encoded envelope', () => {
    const original: AgentEnvelope = {
      type: 'platform.auth.start',
      id: 'abc',
      payload: { requestId: 'r1', platform: 'douyin' },
    };
    const parsed = parseAgentMessage(encodeAgentMessage(original));
    expect(parsed).toEqual(original);
  });

  it('rejects malformed JSON', () => {
    expect(parseAgentMessage('{nope')).toBeNull();
    expect(parseAgentMessage('')).toBeNull();
  });

  it('rejects JSON null', () => {
    expect(parseAgentMessage('null')).toBeNull();
  });

  it('rejects JSON scalars', () => {
    expect(parseAgentMessage('42')).toBeNull();
    expect(parseAgentMessage('"agent.ping"')).toBeNull();
    expect(parseAgentMessage('true')).toBeNull();
  });

  it('rejects objects whose type is missing or not a string', () => {
    expect(parseAgentMessage('{}')).toBeNull();
    expect(parseAgentMessage('{"type":123}')).toBeNull();
    expect(parseAgentMessage('{"type":null}')).toBeNull();
  });

  it('rejects arrays', () => {
    expect(parseAgentMessage('[{"type":"agent.ping"}]')).toBeNull();
  });

  it('keeps unknown extra fields intact', () => {
    const parsed = parseAgentMessage(
      '{"type":"agent.hello","extra":"kept","payload":{"a":1}}',
    );
    expect(parsed).toMatchObject({ type: 'agent.hello', payload: { a: 1 } });
    expect((parsed as Record<string, unknown>).extra).toBe('kept');
  });
});
