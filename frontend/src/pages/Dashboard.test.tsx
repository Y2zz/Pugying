import { renderToString } from 'react-dom/server';
import Dashboard from '@/pages/Dashboard';

describe('Dashboard (SSR)', () => {
  it('renders the heading and all stat cards', () => {
    const html = renderToString(<Dashboard />);

    expect(html).toContain('Dashboard');
    expect(html).toContain('总项目数');
    expect(html).toContain('进行中');
    expect(html).toContain('已完成');
    expect(html).toContain('团队成员');
  });

  it('renders the recent activity section', () => {
    const html = renderToString(<Dashboard />);

    expect(html).toContain('最近活动');
    expect(html).toContain('项目「Pugying」已创建');
  });
});
