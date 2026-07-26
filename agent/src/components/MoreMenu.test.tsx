import { renderToString } from 'react-dom/server';
import { installWindowStub } from '../../test/helpers/chrome-shell-stub';
import { MoreMenu } from './MoreMenu';

describe('MoreMenu (SSR smoke)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  it('renders zoom controls, cache clearing and the guide entry', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    const html = renderToString(<MoreMenu />);
    expect(html).toContain('缩放');
    expect(html).toContain('100%');
    expect(html).toContain('清除缓存');
    // Initial kind is 'auth', so the guide entry is present.
    expect(html).toContain('查看操作指引');
  });

  it('parks the card off-screen until an anchor arrives', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    const html = renderToString(<MoreMenu />);
    expect(html).toContain('-9999');
  });
});
