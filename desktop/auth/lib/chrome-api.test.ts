import { installWindowStub } from '../../test/helpers/chrome-shell-stub';
import { getChromeShell } from './chrome-api';

interface GlobalWithWindow {
  window?: unknown;
}

describe('getChromeShell', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  it('returns the bridge exposed by the preload script', () => {
    const stub = installWindowStub();
    restore = stub.restore;
    expect(getChromeShell()).toBe(stub.chromeShell);
  });

  it('throws when the bridge is missing from window', () => {
    const globalRef = globalThis as GlobalWithWindow;
    const previous = globalRef.window;
    const hadPrevious = 'window' in globalRef;
    globalRef.window = {};
    restore = () => {
      if (hadPrevious) {
        globalRef.window = previous;
      } else {
        delete globalRef.window;
      }
    };
    expect(() => getChromeShell()).toThrow('chromeShell is not available');
  });
});
