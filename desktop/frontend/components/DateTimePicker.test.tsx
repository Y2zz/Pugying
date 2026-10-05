// @vitest-environment jsdom
import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateTimePicker } from './DateTimePicker';
import { ArticleScheduleField } from '@/pages/publish-article/account-forms/shared-fields';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 3, 10, 15, 30));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Picker({
  initial = '',
  onChange = vi.fn(),
}: {
  initial?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateTimePicker
      id="schedule"
      value={value}
      minHours={2}
      maxDays={14}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}
async function openPicker(initial = '', onChange = vi.fn()) {
  render(<Picker initial={initial} onChange={onChange} />);
  fireEvent.click(screen.getAllByRole('button')[0]);
  await screen.findByRole('button', { name: '清空日期时间' });
  return onChange;
}
function day(date: Date) {
  return document.querySelector<HTMLButtonElement>(
    `button[data-day="${date.toLocaleDateString('zh-CN')}"]`,
  )!;
}

it('disables dates outside the platform window and selects a valid time on the first day', async () => {
  const changed = await openPicker();
  expect(day(new Date(2026, 9, 2)).disabled).toBe(true);
  expect(day(new Date(2026, 9, 18)).disabled).toBe(true);
  fireEvent.click(day(new Date(2026, 9, 2)));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(day(new Date(2026, 9, 3)));
  expect(changed).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('combobox', { name: '分钟' }).textContent).toContain('16 分'));
});

it('disables hours before the minimum and chooses the first valid minute when changing to the boundary hour', async () => {
  const changed = await openPicker('2026-10-03T13:05');
  fireEvent.click(screen.getByRole('combobox', { name: '小时' }));
  const earlier = await screen.findByRole('option', { name: '11 时' });
  expect(earlier.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(earlier);
  expect(changed).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('option', { name: '12 时' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: '分钟' }).textContent).toContain('16 分'));
  fireEvent.click(screen.getByRole('combobox', { name: '分钟' }));
  const minute = await screen.findByRole('option', { name: '15 分' });
  expect(minute.getAttribute('aria-disabled')).toBe('true');
});

it('disables hours and minutes after the upper boundary', async () => {
  const changed = await openPicker('2026-10-17T09:55');
  fireEvent.click(screen.getByRole('combobox', { name: '小时' }));
  expect(
    (await screen.findByRole('option', { name: '11 时' })).getAttribute(
      'aria-disabled',
    ),
  ).toBe('true');
  await userEvent.click(screen.getByRole('option', { name: '10 时' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: '分钟' }).textContent).toContain('15 分'));
  fireEvent.click(screen.getByRole('combobox', { name: '分钟' }));
  expect(
    (await screen.findByRole('option', { name: '16 分' })).getAttribute(
      'aria-disabled',
    ),
  ).toBe('true');
});

it('rechecks the current clock when completing an old boundary selection', async () => {
  await openPicker('2026-10-03T12:16');
  act(() => vi.setSystemTime(new Date(2026, 9, 3, 10, 16, 1)));
  fireEvent.click(screen.getByRole('button', { name: '确定日期时间' }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: '确定日期时间',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true),
  );
  expect(screen.getByRole('combobox', { name: '小时' })).toBeTruthy();
});

it('clears the date without replacing it with a minimum timestamp', async () => {
  const changed = await openPicker('2026-10-03T13:05');
  fireEvent.click(screen.getByRole('button', { name: '清空日期时间' }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(''));
});

it('applies the account platform window instead of a fixed two-hour, fourteen-day limit', async () => {
  const changed = vi.fn();
  render(
    <ArticleScheduleField
      accountId="platform"
      scheduledLocal="2026-10-03T13:05"
      minHours={1}
      maxDays={15}
      onChange={changed}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '发布时间' }));
  await screen.findByRole('button', { name: '清空日期时间' });
  expect(day(new Date(2026, 9, 18)).disabled).toBe(false);
  expect(day(new Date(2026, 9, 19)).disabled).toBe(true);
  fireEvent.click(screen.getByRole('combobox', { name: '小时' }));
  const firstHour = await screen.findByRole('option', { name: '11 时' });
  expect(firstHour.getAttribute('aria-disabled')).not.toBe('true');
  await userEvent.click(firstHour);
  await waitFor(() => expect(screen.getByRole('combobox', { name: '分钟' }).textContent).toContain('16 分'));
});


it('commits the selected time only after confirming and closes the picker', async () => {
  const changed = await openPicker();
  expect((screen.getByRole('button', { name: '确定日期时间' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: '清空日期时间' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(day(new Date(2026, 9, 3)));
  await waitFor(() => expect(screen.getByRole('combobox', { name: '分钟' }).textContent).toContain('16 分'));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '确定日期时间' }));
  await waitFor(() => expect(changed).toHaveBeenCalledExactlyOnceWith('2026-10-03T12:16'));
  await waitFor(() => expect(screen.queryByRole('combobox', { name: '小时' })).toBeNull());
  expect(screen.getByRole('button', { name: /2026年10月03日 12:16/ })).toBeTruthy();
});

it('discards unconfirmed changes on Escape and restores the saved time on reopening', async () => {
  const changed = await openPicker('2026-10-03T13:05');
  fireEvent.click(day(new Date(2026, 9, 4)));
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('combobox', { name: '小时' })).toBeNull());
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /2026年10月03日 13:05/ }));
  await screen.findByRole('button', { name: '确定日期时间' });
  fireEvent.click(screen.getByRole('button', { name: '确定日期时间' }));
  await waitFor(() => expect(changed).toHaveBeenCalledExactlyOnceWith('2026-10-03T13:05'));
});

it('clears an unconfirmed selection and closes without saving it', async () => {
  const changed = await openPicker();
  fireEvent.click(day(new Date(2026, 9, 3)));
  await waitFor(() => expect((screen.getByRole('button', { name: '清空日期时间' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '清空日期时间' }));
  await waitFor(() => expect(changed).toHaveBeenCalledExactlyOnceWith(''));
  await waitFor(() => expect(screen.queryByRole('combobox', { name: '小时' })).toBeNull());
});
