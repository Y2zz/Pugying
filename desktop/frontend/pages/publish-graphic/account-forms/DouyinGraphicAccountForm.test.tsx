// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  emptyArticleDraft,
  emptyCoverPair,
  draftFromTarget,
  articleDraftHasCustomizations,
} from '../../publish-article/helpers';
import type { PlatformAccountItem } from '@/lib/api';
import { graphicDraftToOverrides, getGraphicAccountDraftIssues } from '../helpers';
import { DouyinGraphicAccountForm } from './DouyinGraphicAccountForm';

const account: PlatformAccountItem = {
  id: 'douyin-graphic',
  platform: 'douyin',
  displayName: '图文账号',
  platformUserId: null,
  avatarUrl: null,
  status: 'active',
  lastAuthedAt: null,
  createdAt: '',
  updatedAt: '',
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Form({
  disabled = false,
  commonTitle = '通用标题',
}: {
  disabled?: boolean;
  commonTitle?: string;
}) {
  const [draft, setDraft] = useState(emptyArticleDraft);
  return (
    <DouyinGraphicAccountForm
      account={account}
      draft={draft}
      commonTitle={commonTitle}
      commonCovers={emptyCoverPair()}
      onDraftChange={setDraft}
      onEditCover={() => {}}
      disabled={disabled}
    />
  );
}

it('groups topic with content and validates the inherited 20-character title', () => {
  render(<Form commonTitle={'标'.repeat(21)} />);
  expect(screen.getByRole('group', { name: '基础信息' }).textContent).toContain('话题');
  expect(screen.getByRole('group', { name: '发布设置' }).textContent).not.toContain('话题');
  expect(screen.getByText('21/20')).toBeTruthy();
  expect(screen.getByRole('textbox', { name: '标题' }).getAttribute('aria-invalid')).toBe('true');
});

it('chooses a declaration and applies account-specific permissions', async () => {
  render(<Form />);
  await userEvent.click(screen.getByRole('button', { name: '自主声明' }));
  await userEvent.click(screen.getByRole('button', { name: '内容由AI生成' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '自主声明' }).textContent).toContain('内容由AI生成');
  fireEvent.click(screen.getByRole('button', { name: '不允许', exact: true }));
  expect(
    screen.getByRole('button', { name: '不允许', exact: true }).getAttribute('aria-pressed'),
  ).toBe('true');
});

it('starts scheduling with a valid rounded time and clears it when immediate is selected', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T10:00:31'));
  render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: '定时发布', exact: true }));
  expect(screen.getByRole('button', { name: /定时发布时间/ }).textContent).toContain('12:01');
  expect(screen.queryByText('需在 2 小时之后')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '立即发布', exact: true }));
  expect(screen.queryByRole('button', { name: /定时发布时间/ })).toBeNull();
});

it('disables every account control while publishing', () => {
  render(<Form disabled />);
  expect(screen.getByRole('textbox', { name: '标题' }).hasAttribute('disabled')).toBe(true);
  for (const button of screen.getAllByRole('button')) {
    expect(button.hasAttribute('disabled')).toBe(true);
  }
});

it('round-trips permissions and declarations and resets them without affecting other platforms', () => {
  const draft = {
    ...emptyArticleDraft(),
    allowDownload: false,
    authorDeclaration: 'ai_generated' as const,
  };
  const overrides = graphicDraftToOverrides(draft, 'douyin');
  const loaded = draftFromTarget(overrides, { tags: [], visibility: 'public', scheduledAt: null });
  expect(loaded.allowDownload).toBe(false);
  expect(loaded.authorDeclaration).toBe('ai_generated');
  expect(articleDraftHasCustomizations(loaded)).toBe(true);
  expect(articleDraftHasCustomizations(emptyArticleDraft())).toBe(false);
  expect(graphicDraftToOverrides(draft, 'xiaohongshu')).toHaveProperty('authorDeclaration', 'ai_generated');
  expect(graphicDraftToOverrides(draft, 'xiaohongshu')).not.toHaveProperty('allowDownload');
});

it('checks the total description and topic length before saving', () => {
  const draft = {
    ...emptyArticleDraft(),
    tagsText: '旅行',
    topicRefs: [{ id: '0', name: '旅行' }],
  };
  expect(getGraphicAccountDraftIssues(draft, 'douyin', '文'.repeat(1000))).toContain(
    '作品描述与话题合计超长',
  );
  expect(getGraphicAccountDraftIssues(draft, 'douyin', '文'.repeat(990))).not.toContain(
    '作品描述与话题合计超长',
  );
});
