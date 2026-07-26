import { renderToString } from 'react-dom/server';
import { AgentStatusBadge } from '@/components/AgentStatusBadge';

describe('AgentStatusBadge (SSR)', () => {
  it('renders the disconnected label and default title', () => {
    const html = renderToString(<AgentStatusBadge />);

    expect(html).toContain('Agent 未连接');
    expect(html).toContain('title="Pugying Agent"');
  });

  it('merges a custom class name', () => {
    const html = renderToString(<AgentStatusBadge className="my-badge" />);

    expect(html).toContain('my-badge');
  });
});
