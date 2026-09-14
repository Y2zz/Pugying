import { useEffect } from 'react';
import { agentClient } from '@/lib/agent-client';
import { reauthPlatformAccount } from '@/lib/api';

/** Fired after a creator-center close event has been written back. */
export const PLATFORM_ACCOUNT_SYNCED_EVENT = 'pugying:platform-account-synced';

/**
 * App-wide listener: when the Agent reports a creator-center window closed,
 * write the refreshed cookies back to the backend so the stored login state
 * stays fresh. Mounted in AppLayout so the write-back happens no matter
 * which page the user is on when the window closes.
 */
export function useCreatorWindowSync(): void {
  useEffect(() => {
    return agentClient.subscribeCreatorWindowClosed((event) => {
      if (event.cookies.length === 0) {
        return;
      }
      void reauthPlatformAccount(event.accountId, {
        cookies: event.cookies,
        finalUrl: event.finalUrl,
        profile: event.profile,
      })
        .then(() => {
          window.dispatchEvent(
            new CustomEvent(PLATFORM_ACCOUNT_SYNCED_EVENT, {
              detail: { accountId: event.accountId },
            }),
          );
        })
        .catch(() => {
          // 回写失败不打断用户；库中保留上次凭证，下次打开仍可用。
        });
    });
  }, []);
}
