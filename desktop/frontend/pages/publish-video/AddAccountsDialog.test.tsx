// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlatformAccountItem, PlatformCatalogItem } from '@/lib/api';
import { AddAccountsDialog } from './AddAccountsDialog';

const catalog: PlatformCatalogItem[] = [
  { id: 'douyin', displayName: '抖音', loginUrl: '' },
  { id: 'bilibili', displayName: '哔哩哔哩', loginUrl: '' },
];
const account = (id: string, platform: PlatformAccountItem['platform'], status: PlatformAccountItem['status'] = 'active'): PlatformAccountItem => ({
  id,
  platform,
  displayName: `创作者${id}`,
  platformUserId: `user-${id}`,
  status,
  avatarUrl: null,
  lastAuthedAt: null,
  createdAt: '',
  updatedAt: '',
});
const accounts = [account('a', 'douyin'), account('b', 'bilibili'), account('c', 'douyin', 'expired')];

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations');
});

async function setup(selected: Record<string, boolean> = {}) {
  const onConfirm = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <MemoryRouter>
        <button onClick={() => setOpen(true)}>打开选择</button>
        <AddAccountsDialog
          open={open}
          onOpenChange={setOpen}
          accounts={accounts}
          catalog={catalog}
          selected={selected}
          onConfirm={onConfirm}
        />
      </MemoryRouter>
    );
  }
  await act(async () => { render(<Harness />); });
  return { onConfirm };
}

it('starts with all platforms and searches account IDs across platforms', async () => {
  await setup();
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  fireEvent.change(screen.getByRole('textbox', { name: '搜索账号' }), { target: { value: 'user-b' } });
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.getByRole('checkbox', { name: /创作者b/ })).toBeTruthy();
});

it('preserves selected accounts across filters and confirms them together', async () => {
  const { onConfirm } = await setup();
  fireEvent.click(screen.getByRole('checkbox', { name: /创作者a/ }));
  expect(screen.getByRole('checkbox', { name: /创作者a/ }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('button', { name: '抖音，已选 1 个，可选 1 个' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '哔哩哔哩，已选 0 个，可选 1 个' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /创作者b/ }));
  expect(screen.getByText('已选 2 个账号')).toBeTruthy();
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '确认选择' }));
  expect(onConfirm).toHaveBeenCalledWith({ a: true, b: true });
});

it('disables expired accounts and clears historical selections for them', async () => {
  const { onConfirm } = await setup({ c: true });
  const expired = screen.getByRole('checkbox', { name: /创作者c/ });
  expect(expired.hasAttribute('disabled') || expired.getAttribute('aria-disabled') === 'true').toBe(true);
  fireEvent.click(expired);
  expect(screen.getByText('已选 0 个账号')).toBeTruthy();
  expect(screen.getByRole('link', { name: '去媒体账号重新授权' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '确认选择' }));
  expect(onConfirm).toHaveBeenCalledWith({});
});

it('discards changes on cancel and restores the saved selection when reopened', async () => {
  const { onConfirm } = await setup({ a: true });
  fireEvent.click(screen.getByRole('checkbox', { name: /创作者b/ }));
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(onConfirm).not.toHaveBeenCalled();
  await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '打开选择' })); });
  expect(screen.getByRole('checkbox', { name: /创作者a/ }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('checkbox', { name: /创作者b/ }).getAttribute('aria-checked')).toBe('false');
});
