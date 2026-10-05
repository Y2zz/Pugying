import { expect, it } from 'vitest';
import { parseToutiaoRewardPrivilege } from './toutiao-article-privileges';

it.each([0, 1, 3, 5])(
  'uses the actual remaining count %s without a fixed daily allowance',
  (count) => {
    expect(parseToutiaoRewardPrivilege(`允许赞赏（今日还有${count}次机会）`, false)).toMatchObject({
      remainingToday: count,
      available: count > 0,
    });
  },
);
it('respects platform disabling even when remaining count is positive', () => {
  expect(parseToutiaoRewardPrivilege('允许赞赏（今日还有2次机会）', true)?.available).toBe(false);
});
it('preserves platform text and never invents an absent count', () => {
  expect(parseToutiaoRewardPrivilege('允许赞赏', false)).toMatchObject({
    label: '允许赞赏',
    remainingToday: null,
  });
  expect(parseToutiaoRewardPrivilege('允许赞赏（今日还有 2 次机会）', false)?.remainingToday).toBe(
    2,
  );
  expect(parseToutiaoRewardPrivilege('请登录', false)).toBeNull();
});
