import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';

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
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      innerWidth: 1280,
      matchMedia: () => ({
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: createLocalStorageStub({
      pugying_access_token: 'token-abc',
      pugying_user: JSON.stringify({
        id: 'u1',
        email: 'admin@pugying.local',
        username: 'admin',
        teamId: 't1',
        permissions: ['Content.Contents.View'],
      }),
      pugying_team_id: 't1',
      pugying_team_info: JSON.stringify({
        id: 't1',
        name: 'default',
        displayName: '默认团队',
      }),
    }),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  if (savedLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', savedLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
  if (savedWindow) {
    Object.defineProperty(globalThis, 'window', savedWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

function renderLayout(): string {
  return renderToString(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppLayout />
    </MemoryRouter>
  );
}

describe('AppLayout (SSR)', () => {
  it('renders brand in sidebar header and user menu in sidebar footer', () => {
    const html = renderLayout();

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('Pugying');
    expect(html).toContain('蒲公英');
    expect(html).toContain('Agent 未连接');
    // footer 仅 NavUser 触发器；团队切换在用户下拉二级子菜单内（SSR 不展开下拉）
    expect(html).toContain('admin@pugying.local');
    expect(html).toContain('data-sidebar="footer"');
  });

  it('renders the app sidebar navigation entries', () => {
    const html = renderLayout();

    expect(html).toContain('Dashboard');
    expect(html).toContain('内容管理');
    expect(html).toContain('媒体库');
    expect(html).toContain('媒体账号');
  });

  it('renders user identity and expandable user menu in sidebar footer', () => {
    const html = renderLayout();

    expect(html).toContain('admin@pugying.local');
    // 用户菜单始终可展开（ChevronsUpDown 指示下拉），退出登录在下拉内
    expect(html).toContain('lucide-chevrons-up-down');
  });
});
