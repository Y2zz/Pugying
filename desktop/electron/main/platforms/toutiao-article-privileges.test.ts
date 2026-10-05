import { beforeEach, expect, it, vi } from 'vitest';
import { fetchToutiaoRewardPrivilege } from './toutiao-article-privileges';

const fake = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  executeJavaScript: vi.fn(),
  loadURL: vi.fn(),
  destroy: vi.fn(),
  fromPartition: vi.fn(),
  clearStorageData: vi.fn(),
  clearCache: vi.fn(),
  closeAllConnections: vi.fn(),
  injectCookies: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('../auth-browser', () => ({ injectCookies: fake.injectCookies }));
vi.mock('../server-process', () => ({
  getApiBaseUrl: () => 'http://127.0.0.1:3928',
  getLocalApiToken: () => 'test-token',
}));
vi.mock('electron', () => ({
  session: { fromPartition: fake.fromPartition },
  BrowserWindow: class {
    destroyed = false;
    webContents = { executeJavaScript: fake.executeJavaScript, setWindowOpenHandler: vi.fn() };
    constructor(options: Record<string, unknown>) {
      fake.options.push(options);
    }
    loadURL = fake.loadURL;
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
      fake.destroy();
    }
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  fake.options.length = 0;
  vi.stubGlobal('fetch', fake.fetch);
  fake.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      platform: 'toutiao',
      cookies: [{ name: 'test-cookie', value: 'test-value' }],
    }),
  });
  fake.fromPartition.mockReturnValue({
    clearStorageData: fake.clearStorageData,
    clearCache: fake.clearCache,
    closeAllConnections: fake.closeAllConnections,
  });
  fake.clearStorageData.mockResolvedValue(undefined);
  fake.clearCache.mockResolvedValue(undefined);
  fake.closeAllConnections.mockResolvedValue(undefined);
  fake.loadURL.mockResolvedValue(undefined);
  fake.injectCookies.mockResolvedValue(undefined);
  fake.executeJavaScript.mockResolvedValue({
    label: '允许赞赏（今日还有2次机会）',
    disabled: false,
  });
});
afterEach(() => vi.unstubAllGlobals());

it('reads each account with isolated credentials and destroys the hidden browser afterwards', async () => {
  expect(await fetchToutiaoRewardPrivilege('account-a')).toMatchObject({
    remainingToday: 2,
    available: true,
  });
  expect(fake.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:3928/platform-accounts/account-a/credentials',
    expect.objectContaining({ method: 'POST', headers: { 'X-Pugying-Local-Token': 'test-token' } }),
  );
  expect(fake.fromPartition.mock.calls[0][0]).toMatch(/^toutiao-article-privileges-/);
  expect(fake.fromPartition.mock.calls[0][0]).not.toMatch(/^persist:/);
  expect(fake.options[0]).toMatchObject({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  expect(fake.loadURL).toHaveBeenCalledWith('https://mp.toutiao.com/profile_v4/graphic/publish');
  expect(fake.destroy).toHaveBeenCalled();
  expect(fake.clearStorageData).toHaveBeenCalled();
});
it('does not probe another platform or assume five chances when lookup fails', async () => {
  fake.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ platform: 'douyin', cookies: [{}] }),
  });
  expect(await fetchToutiaoRewardPrivilege('other')).toBeNull();
  expect(fake.fromPartition).not.toHaveBeenCalled();
  fake.fetch.mockRejectedValueOnce(new Error('offline'));
  expect(await fetchToutiaoRewardPrivilege('failed')).toBeNull();
});
it('deduplicates concurrent reads and does not cache stale counts between subsequent reads', async () => {
  const [a, b] = await Promise.all([
    fetchToutiaoRewardPrivilege('same'),
    fetchToutiaoRewardPrivilege('same'),
  ]);
  expect(a?.remainingToday).toBe(2);
  expect(b?.remainingToday).toBe(2);
  expect(fake.fetch).toHaveBeenCalledTimes(1);
  fake.executeJavaScript.mockResolvedValueOnce({
    label: '允许赞赏（今日还有0次机会）',
    disabled: false,
  });
  expect(await fetchToutiaoRewardPrivilege('same')).toMatchObject({
    remainingToday: 0,
    available: false,
  });
  expect(fake.fetch).toHaveBeenCalledTimes(2);
});
