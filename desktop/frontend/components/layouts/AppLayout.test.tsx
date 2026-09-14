import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { ThemeProvider } from '@/components/ThemeProvider';

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
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
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
    <ThemeProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppLayout />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('AppLayout (SSR)', () => {
  it('renders brand in sidebar header', () => {
    const html = renderLayout();

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('Pugying');
    expect(html).toContain('蒲公英');
    expect(html).not.toContain('本机服务未连接');
    expect(html).not.toContain('个人单机版');
  });

  it('renders icon-only theme toggle and preferences in the sidebar footer', () => {
    const html = renderLayout();

    expect(html).toContain('切换深色');
    expect(html).toContain('href="/preferences"');
    expect(html).toContain('偏好设置');
    expect(html).toContain('data-sidebar="footer"');
    expect(html).toContain('产品更新');
    expect(html).toMatch(/v[\d.]+/);
    // 折叠时底栏竖排，避免两个 icon 横挤出窄列
    expect(html).toContain('group-data-[collapsible=icon]:flex-col');
  });

  it('renders the app sidebar navigation entries', () => {
    const html = renderLayout();

    expect(html).toContain('Dashboard');
    expect(html).toContain('作品管理');
    expect(html).toContain('媒体库');
    expect(html).toContain('媒体账号');
  });

  it('locks the shell to the viewport and scrolls inside main', () => {
    const html = renderLayout();

    expect(html).toContain('data-slot="sidebar-wrapper"');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('data-slot="sidebar-inset"');
    expect(html).toContain('overflow-y-auto');
  });
});
