import { CHROME_HEIGHT, IPC } from './ipc';

describe('IPC channel map', () => {
  it('uses the chrome: prefix on every channel', () => {
    for (const channel of Object.values(IPC)) {
      expect(channel).toMatch(/^chrome:[a-z-]+$/);
    }
  });

  it('has no duplicate channel names', () => {
    const values = Object.values(IPC);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps the channels the preload script depends on', () => {
    expect(IPC.state).toBe('chrome:state');
    expect(IPC.guide).toBe('chrome:guide');
    expect(IPC.notice).toBe('chrome:notice');
    expect(IPC.complete).toBe('chrome:complete');
    expect(IPC.cancel).toBe('chrome:cancel');
    expect(IPC.clearCacheRun).toBe('chrome:clear-cache-run');
  });
});

describe('chrome layout constants', () => {
  it('reserves 48px for the toolbar chrome', () => {
    expect(CHROME_HEIGHT).toBe(48);
  });
});
