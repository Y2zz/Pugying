import { renderToString } from 'react-dom/server';
import { beforeEach, vi } from 'vitest';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';
import { Sidebar, SidebarProvider } from '@/components/ui/sidebar';
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

    expect(html).toContain('本机服务未连接');
    expect(html).toContain('本机服务未连接，点击查看说明');
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

    expect(html).toContain('>本机服务<');
    expect(html).not.toContain('Agent 连接中');
    expect(html).not.toContain('本机服务未连接');
    expect(html).toContain('正在连接');
    expect(html).toContain('正在连接本机服务…');
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

    expect(html).toContain('>本机服务<');
    expect(html).toContain('本机服务已就绪 · v1.0.0');
    expect(html).not.toContain('animate-spin');
  });

  it('merges a custom class name', () => {
    const html = renderToString(<AgentStatusBadge className="my-badge" />);

    expect(html).toContain('my-badge');
  });

  it('renders sidebar placement in the footer menu', () => {
    const html = renderToString(
      <SidebarProvider>
        <Sidebar>
          <AgentStatusBadge placement="sidebar" />
        </Sidebar>
      </SidebarProvider>,
    );

    expect(html).toContain('本机服务未连接');
    expect(html).toContain('data-sidebar="menu-button"');
    expect(html).toContain('lucide-monitor');
  });
});
