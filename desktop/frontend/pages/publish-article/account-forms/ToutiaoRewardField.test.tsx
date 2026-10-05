// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToutiaoRewardField } from './ToutiaoRewardField';
const read = vi.hoisted(() => vi.fn());
vi.mock('@/lib/agent-client', () => ({
  getPugyingDesktopBridge: () => ({ getToutiaoRewardPrivilege: read }),
}));
beforeEach(() => {
  read.mockReset();
});
afterEach(cleanup);
function Form({ accountId = 'a' }: { accountId?: string }) {
  const [checked, setChecked] = useState(true);
  return <ToutiaoRewardField accountId={accountId} checked={checked} onChange={setChecked} />;
}
it('displays the selected account platform label and enables available choices', async () => {
  read.mockResolvedValue({
    label: '允许赞赏（今日还有3次机会）',
    remainingToday: 3,
    available: true,
  });
  render(<Form />);
  const checkbox = await screen.findByRole('checkbox', { name: '允许赞赏（今日还有3次机会）' });
  expect(checkbox.getAttribute('aria-disabled')).not.toBe('true');
  expect(read).toHaveBeenCalledWith('a');
});
it('clears and disables reward selection when the current account has exhausted its allowance', async () => {
  read.mockResolvedValue({
    label: '允许赞赏（今日还有0次机会）',
    remainingToday: 0,
    available: false,
  });
  render(<Form />);
  const checkbox = await screen.findByRole('checkbox', { name: '允许赞赏（今日还有0次机会）' });
  await waitFor(() => expect(checkbox.getAttribute('aria-checked')).toBe('false'));
  expect(checkbox.getAttribute('aria-disabled')).toBe('true');
});
it('does not reuse another account count when changing accounts', async () => {
  read
    .mockResolvedValueOnce({
      label: '允许赞赏（今日还有4次机会）',
      remainingToday: 4,
      available: true,
    })
    .mockResolvedValueOnce({
      label: '允许赞赏（今日还有1次机会）',
      remainingToday: 1,
      available: true,
    });
  const { rerender } = render(<Form accountId="a" />);
  await screen.findByRole('checkbox', { name: '允许赞赏（今日还有4次机会）' });
  rerender(<Form accountId="b" />);
  await screen.findByRole('checkbox', { name: '允许赞赏（今日还有1次机会）' });
  expect(read).toHaveBeenLastCalledWith('b');
});
it('shows failure without invented quota and allows a retry', async () => {
  read
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      label: '允许赞赏（今日还有2次机会）',
      remainingToday: 2,
      available: true,
    });
  render(<Form />);
  await screen.findByText('赞赏次数暂未获取');
  expect(screen.getByRole('checkbox', { name: '允许赞赏' }).getAttribute('aria-disabled')).toBe(
    'true',
  );
  await userEvent.setup().click(screen.getByRole('button', { name: '刷新' }));
  await screen.findByRole('checkbox', { name: '允许赞赏（今日还有2次机会）' });
});
