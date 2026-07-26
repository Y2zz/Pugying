import { renderToString } from 'react-dom/server';
import { installWindowStub } from '../../test/helpers/chrome-shell-stub';
import { AuthToolbar } from './AuthToolbar';

describe('AuthToolbar (SSR smoke)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  it('renders navigation controls and the auth actions by default', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    const html = renderToString(<AuthToolbar />);
    expect(html).toContain('后退');
    expect(html).toContain('前进');
    expect(html).toContain('刷新');
    expect(html).toContain('更多');
    expect(html).toContain('取消');
    expect(html).toContain('完成授权');
  });

  it('hides the auth actions in browse mode', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    const html = renderToString(<AuthToolbar variant="browse" />);
    expect(html).toContain('后退');
    expect(html).toContain('更多');
    expect(html).not.toContain('完成授权');
    expect(html).not.toContain('取消');
  });

  it('starts back/forward disabled before any state push', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    const html = renderToString(<AuthToolbar />);
    const disabledCount = (html.match(/disabled=""/g) ?? []).length;
    expect(disabledCount).toBeGreaterThanOrEqual(2);
  });
});
