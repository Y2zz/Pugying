// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, vi } from 'vitest';

import { NavUserTeamMenu } from '@/components/layouts/NavUserTeamMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import type { TeamOption } from '@/lib/api';

const defaultTeam: TeamOption = { id: 't1', name: 'default', displayName: '默认团队' };
const demoTeam: TeamOption = { id: 't2', name: 'demo', displayName: '演示团队' };

const testUser = {
  name: 'admin',
  email: 'admin@pugying.local',
  avatar: '',
};

const useTeamMock = vi.hoisted(() =>
  vi.fn(() => ({
    teams: [defaultTeam, demoTeam] as TeamOption[],
    current: defaultTeam,
    loading: false,
    switchTo: vi.fn(),
    leaveCurrent: vi.fn(),
  })),
);

vi.mock('@/hooks/use-team', () => ({
  useTeam: useTeamMock,
}));

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

function setStoredUser(permissions: string[]): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createLocalStorageStub({
      pugying_user: JSON.stringify({
        id: 'u1',
        email: 'admin@pugying.local',
        username: 'admin',
        teamId: 't1',
        permissions,
      }),
    }),
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  useTeamMock.mockReturnValue({
    teams: [defaultTeam, demoTeam],
    current: defaultTeam,
    loading: false,
    switchTo: vi.fn(),
    leaveCurrent: vi.fn(),
  });
  setStoredUser(['Content.Contents.View']);
});

afterEach(() => {
  if (savedLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', savedLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

function renderMenu(): void {
  // 与 NavUser 一致：用户信息 SubTrigger 挂在 DropdownMenuGroup 内
  render(
    <DropdownMenu open>
      <DropdownMenuContent>
        <DropdownMenuGroup className="p-1">
          <NavUserTeamMenu user={testUser} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function openTeamSubmenu(): Promise<void> {
  const user = userEvent.setup();
  const trigger = screen.getByRole('menuitem', { name: /切换团队，当前 默认团队/ });
  trigger.focus();
  await user.keyboard('{ArrowRight}');
}

describe('NavUserTeamMenu', () => {
  it('uses user info block as submenu trigger without a separate switch row', async () => {
    renderMenu();

    expect(screen.getByText('admin@pugying.local')).toBeTruthy();
    expect(screen.queryByText('切换团队')).toBeNull();
    expect(document.querySelector('[data-slot="dropdown-menu-sub-trigger"]')).toBeTruthy();

    await openTeamSubmenu();

    const subContent = document.querySelector('[data-slot="dropdown-menu-sub-content"]');
    expect(subContent).toBeTruthy();

    const subMenu = within(subContent as HTMLElement);
    expect(subMenu.getByText('演示团队')).toBeTruthy();
    expect(screen.queryByText('当前')).toBeNull();

    const currentItem = subMenu.getByRole('menuitem', { name: /默认团队/ });
    expect(currentItem.querySelector('svg.lucide-check')).toBeTruthy();
  });

  it('hides leave action without Account.Users.Leave permission', async () => {
    renderMenu();
    await openTeamSubmenu();

    expect(screen.queryByText('离开当前团队')).toBeNull();
  });

  it('shows leave action in submenu when permitted and multiple teams exist', async () => {
    setStoredUser(['Account.Users.Leave']);

    renderMenu();
    await openTeamSubmenu();

    expect(screen.getByText('离开当前团队')).toBeTruthy();
  });
});
