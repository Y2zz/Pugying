// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FirstRunGuide } from './FirstRunGuide';
import { StepBubble } from './StepBubble';
import { firstRunSlides, authBubbleSteps } from '../../electron/main/guide';
import type { GuidePayload } from '@shared/ipc';

const bridge = vi.hoisted(() => ({
  onGuide: vi.fn(),
  guideReady: vi.fn(async () => undefined),
  guideSkipFirstRun: vi.fn(async () => undefined),
  guideFinishFirstRun: vi.fn(async () => undefined),
  guideCloseBubbles: vi.fn(async () => undefined),
  guideDismissBubblesForever: vi.fn(async () => undefined),
}));

vi.mock('@auth/lib/chrome-api', () => ({ getChromeShell: () => bridge }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

function deliver(payload: GuidePayload): void {
  bridge.onGuide.mockImplementation(
    (listener: (payload: GuidePayload) => void) => {
      listener(payload);
      return () => undefined;
    },
  );
}

it('shows a single introduction with distinct start and skip actions', () => {
  deliver({
    kind: 'first-run',
    platformName: '今日头条',
    slideIndex: 0,
    slides: firstRunSlides('今日头条'),
  });
  render(<FirstRunGuide />);
  expect(screen.getByRole('dialog', { name: '绑定今日头条账号' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '下一步' })).toBeNull();
  const start = screen.getByRole('button', { name: '开始登录' });
  expect(document.activeElement).toBe(start);
  fireEvent.click(start);
  expect(bridge.guideFinishFirstRun).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '跳过' }));
  expect(bridge.guideSkipFirstRun).toHaveBeenCalledOnce();
});

it('shows a non-modal hint with temporary close and persistent dismiss actions', () => {
  deliver({
    kind: 'bubbles',
    platformName: '今日头条',
    stepIndex: 0,
    steps: authBubbleSteps('今日头条'),
    completeAnchor: null,
  });
  render(<StepBubble />);
  expect(screen.getByText('登录今日头条账号')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: '下一步' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '关闭提示' }));
  expect(bridge.guideCloseBubbles).toHaveBeenCalledOnce();
  expect(bridge.guideDismissBubblesForever).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '不再提示' }));
  expect(bridge.guideDismissBubblesForever).toHaveBeenCalledOnce();
});
