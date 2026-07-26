import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from '@/components/RequireAdmin';
import { canAccessAdmin } from '@/lib/permissions';

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

describe('canAccessAdmin', () => {
  it('denies undefined or empty permission lists', () => {
    expect(canAccessAdmin(undefined)).toBe(false);
    expect(canAccessAdmin([])).toBe(false);
  });

  it('denies permissions outside of TeamManagement', () => {
    expect(canAccessAdmin(['Contents.Read', 'Dashboard.View'])).toBe(false);
    expect(canAccessAdmin(['NotTeamManagement.Members'])).toBe(false);
  });

  it('allows any TeamManagement.* permission', () => {
    expect(canAccessAdmin(['TeamManagement.Members'])).toBe(true);
    expect(canAccessAdmin(['Contents.Read', 'TeamManagement.Roles'])).toBe(true);
  });
});

describe('RequireAdmin (SSR)', () => {
  function renderGuard(): string {
    return renderToString(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<RequireAdmin />}>
            <Route index element={<div>admin-child-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders the nested route for an authenticated admin user', () => {
    stubSession({
      pugying_access_token: 'token-abc',
      pugying_user: JSON.stringify({
        id: 'u1',
        email: 'admin@pugying.local',
        username: 'admin',
        teamId: 't1',
        permissions: ['TeamManagement.Members'],
      }),
    });

    expect(renderGuard()).toContain('admin-child-content');
  });

  it('renders no admin content for a non-admin user', () => {
    stubSession({
      pugying_access_token: 'token-abc',
      pugying_user: JSON.stringify({
        id: 'u1',
        email: 'user@pugying.local',
        username: 'user',
        teamId: 't1',
        permissions: ['Contents.Read'],
      }),
    });

    expect(renderGuard()).not.toContain('admin-child-content');
  });

  it('renders no admin content when logged out', () => {
    stubSession({});

    expect(renderGuard()).not.toContain('admin-child-content');
  });
});
