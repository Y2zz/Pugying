import { renderToString } from 'react-dom/server';
import Dashboard from '@/pages/Dashboard';

describe('Dashboard (SSR)', () => {
  it('renders the heading and all stat cards', () => {
    const html = renderToString(<Dashboard />);

    expect(html).toContain('概览');
    expect(html).toContain('内容草稿');
    expect(html).toContain('已绑定账号');
    expect(html).toContain('本机素材');
    expect(html).toContain('发布记录');
  });

  it('renders the recent activity section', () => {
    const html = renderToString(<Dashboard />);

    expect(html).toContain('最近活动');
    expect(html).toContain('在「媒体账号」中绑定要发布的平台账号');
  });
});
