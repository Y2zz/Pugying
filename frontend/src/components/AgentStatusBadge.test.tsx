import { renderToString } from 'react-dom/server';
import { beforeEach, vi } from 'vitest';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';
import type { AgentConnectionStatus } from '@/lib/agent-client';

const useAgentMock = vi.hoisted(() =>
  vi.fn(() => ({
    status: 'disconnected' as AgentConnectionStatus,
    version: null as string | null,
    capabilities: [] as string[],
    connected: false,
    publishBusy: false,
    canPublish: false,
    ping: vi.fn(),
  })),
);

vi.mock('@/hooks/use-agent', () => ({
  useAgent: useAgentMock,
}));

describe('AgentStatusBadge (SSR)', () => {
  beforeEach(() => {
    useAgentMock.mockReturnValue({
      status: 'disconnected',
      version: null,
      capabilities: [],
      connected: false,
      publishBusy: false,
      canPublish: false,
      ping: vi.fn(),
    });
  });

  it('renders the disconnected label', () => {
    const html = renderToString(<AgentStatusBadge />);

    expect(html).toContain('Agent 未连接');
    expect(html).toContain('桌面 Agent 未连接，点击查看说明');
  });

  it('renders Agent with spinner while connecting', () => {
    useAgentMock.mockReturnValue({
      status: 'connecting',
      version: null,
      capabilities: [],
      connected: false,
      publishBusy: false,
      canPublish: false,
      ping: vi.fn(),
    });

    const html = renderToString(<AgentStatusBadge />);

    expect(html).toContain('>Agent<');
    expect(html).not.toContain('Agent 连接中');
    expect(html).not.toContain('Agent 未连接');
    expect(html).toContain('正在连接');
    expect(html).toContain('正在连接本机 Agent…');
    expect(html).toContain('animate-spin');
  });

  it('renders Agent with connected tooltip when connected', () => {
    useAgentMock.mockReturnValue({
      status: 'connected',
      version: '1.0.0',
      capabilities: [],
      connected: true,
      publishBusy: false,
      canPublish: true,
      ping: vi.fn(),
    });

    const html = renderToString(<AgentStatusBadge />);

    expect(html).toContain('>Agent<');
    expect(html).toContain('桌面 Agent 已连接 · v1.0.0');
    expect(html).not.toContain('animate-spin');
  });

  it('merges a custom class name', () => {
    const html = renderToString(<AgentStatusBadge className="my-badge" />);

    expect(html).toContain('my-badge');
  });
});
