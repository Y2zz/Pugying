import { renderToString } from 'react-dom/server';
import AdminPlaceholder from '@/pages/admin/Placeholder';

describe('AdminPlaceholder (SSR)', () => {
  it('renders the given title as the page heading', () => {
    const html = renderToString(<AdminPlaceholder title="成员" />);

    expect(html).toContain('成员</h1>');
  });

  it('renders the placeholder hint', () => {
    const html = renderToString(<AdminPlaceholder title="角色" />);

    expect(html).toContain('页面占位，后续接入 CRUD。');
  });
});
