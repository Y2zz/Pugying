import { renderToString } from 'react-dom/server';
import { installWindowStub } from '../../test/helpers/chrome-shell-stub';
import { FirstRunGuide } from './FirstRunGuide';

describe('FirstRunGuide (SSR smoke)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  it('renders nothing until a first-run guide payload arrives', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    expect(renderToString(<FirstRunGuide />)).toBe('');
  });

  it('does not call any bridge method during render', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    renderToString(<FirstRunGuide />);
    // Subscriptions happen in effects, which never run during SSR.
    expect(stub.calls).toEqual([]);
  });
});
