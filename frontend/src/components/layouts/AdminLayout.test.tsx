import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AdminLayout } from '@/components/layouts/AdminLayout';

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
        permissions: [
          'TeamManagement.Teams.View',
          'Identity.Users.View',
          'Identity.Roles.View',
        ],
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
    <MemoryRouter initialEntries={['/admin']}>
      <AdminLayout />
    </MemoryRouter>
  );
}

describe('AdminLayout (SSR)', () => {
  it('renders the admin sidebar navigation entries', () => {
    const html = renderLayout();

    expect(html).toContain('团队管理');
    expect(html).toContain('概览');
    expect(html).toContain('成员');
    expect(html).toContain('角色');
    expect(html).toContain('团队设置');
    expect(html).toContain('返回应用');
    // 「返回应用」在侧栏顶部，先于团队管理导航
    expect(html.indexOf('返回应用')).toBeLessThan(html.indexOf('团队管理'));
  });

  it('renders the sidebar footer with the agent status badge', () => {
    const html = renderLayout();

    expect(html).toContain('团队管理');
    expect(html).toContain('Agent 未连接');
    expect(html).toContain('返回应用');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('data-sidebar="footer"');
  });

  it('does not render the user menu in the admin sidebar', () => {
    const html = renderLayout();

    // 管理区侧栏不展示 NavUser（无邮箱、无退出登录入口）
    expect(html).not.toContain('admin@pugying.local');
  });
});
