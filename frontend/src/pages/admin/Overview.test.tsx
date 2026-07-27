import { renderToString } from 'react-dom/server';
import AdminOverview from '@/pages/admin/Overview';

function createLocalStorageStub(entries: Record<string, string>): Storage {
  let store = new Map<string, string>(Object.entries(entries));
  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store = new Map();
    },
    getItem(key: string): string | null {
      const value = store.get(key);
      return value === undefined ? null : value;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
}

const savedLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function stubSession(entries: Record<string, string>): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createLocalStorageStub(entries),
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  if (savedLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', savedLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

describe('AdminOverview (SSR)', () => {
  it('renders team and user info from the stored session', () => {
    stubSession({
      pugying_user: JSON.stringify({
        id: 'u1',
        email: 'admin@pugying.local',
        username: 'admin',
        teamId: 't1',
        permissions: ['TeamManagement.Teams.View'],
      }),
      pugying_team_info: JSON.stringify({ id: 't1', name: 'default', displayName: '默认团队' }),
    });

    const html = renderToString(<AdminOverview />);

    expect(html).toContain('管理概览');
    expect(html).toContain('默认团队');
    expect(html).toContain('标识：default');
    expect(html).toContain('admin@pugying.local');
  });

  it('falls back to placeholders without a stored session', () => {
    stubSession({});

    const html = renderToString(<AdminOverview />);

    expect(html).toContain('未选择团队');
    expect(html).toContain('登录用户：');
  });

  it('shows the disconnected agent state with the local run hint', () => {
    stubSession({});

    const html = renderToString(<AdminOverview />);

    expect(html).toContain('Agent 未连接');
    expect(html).toContain('disconnected');
    expect(html).toContain('ws://127.0.0.1:3927');
  });
});
