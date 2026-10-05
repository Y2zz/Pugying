import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { injectCookies } from '../auth-browser';
import { getApiBaseUrl, getLocalApiToken } from '../server-process';
import type { AgentCookie } from '../protocol';
import {
  parseToutiaoRewardPrivilege,
  type ToutiaoRewardPrivilege,
} from '@shared/toutiao-article-privileges';

const pending = new Map<string, Promise<ToutiaoRewardPrivilege | null>>();

/** 仅打开空白文章编辑器读取能力，不填写、上传或提交内容。 */
export function fetchToutiaoRewardPrivilege(
  accountId: string,
): Promise<ToutiaoRewardPrivilege | null> {
  const current = pending.get(accountId);
  if (current) {
    return current;
  }
  const request = readPrivilege(accountId)
    .catch(() => null)
    .finally(() => {
      pending.delete(accountId);
    });
  pending.set(accountId, request);
  return request;
}

async function readPrivilege(accountId: string): Promise<ToutiaoRewardPrivilege | null> {
  const response = await fetch(
    `${getApiBaseUrl()}/platform-accounts/${encodeURIComponent(accountId)}/credentials`,
    {
      method: 'POST',
      headers: { 'X-Pugying-Local-Token': getLocalApiToken() },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) {
    return null;
  }
  const account = (await response.json()) as { platform?: string; cookies?: AgentCookie[] };
  if (account.platform !== 'toutiao' || !account.cookies?.length) {
    return null;
  }
  const isolated = session.fromPartition(`toutiao-article-privileges-${randomUUID()}`);
  let window: BrowserWindow | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await injectCookies(isolated, account.cookies);
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        session: isolated,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const probe = async (): Promise<ToutiaoRewardPrivilege | null> => {
      await window!.loadURL('https://mp.toutiao.com/profile_v4/graphic/publish');
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !window!.isDestroyed()) {
        const result = (await window!.webContents.executeJavaScript(`(() => {
          if (location.hostname !== 'mp.toutiao.com') { return null; }
          const label = Array.from(document.querySelectorAll('label')).find((element) =>
            element.textContent?.trim().startsWith('允许赞赏'));
          const input = label?.querySelector('input[type="checkbox"]');
          if (!label || !input) { return null; }
          return { label: label.textContent, disabled: input.disabled || label.getAttribute('aria-disabled') === 'true' || label.classList.contains('byte-checkbox-disabled') };
        })()`)) as { label: string; disabled: boolean } | null;
        if (result) {
          return parseToutiaoRewardPrivilege(result.label, result.disabled);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
      return null;
    };
    return await Promise.race([
      probe(),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), 20000);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    await isolated.clearStorageData().catch(() => {});
    await isolated.clearCache().catch(() => {});
    await isolated.closeAllConnections().catch(() => {});
  }
}
