import { useCallback, useEffect, useRef, useState } from 'react';
import { PRODUCT_VERSION } from '@/lib/app-version';
import { fetchProductVersion } from '@/lib/api';
import { isVersionNewer } from '@/lib/product-version';
import { useAgent } from '@/hooks/use-agent';

const POLL_MS = 10 * 60 * 1000;
const DISMISS_KEY = 'pugying_update_dismissed';

/**
 * 开发预览：假设远端已有新版本，用于查看侧栏圆点与更新弹窗。
 * 确认 UI 后改回 false。
 */
const PREVIEW_UPDATE_AVAILABLE = true;
const PREVIEW_REMOTE_VERSION = '99.0.0';

function readDismissedVersion(): string | null {
  return localStorage.getItem(DISMISS_KEY);
}

function writeDismissedVersion(version: string): void {
  localStorage.setItem(DISMISS_KEY, version);
}

export function useProductUpdateCheck() {
  const { status, version: agentVersion } = useAgent();
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [minAgentVersion, setMinAgentVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    readDismissedVersion(),
  );
  const [chunkStale, setChunkStale] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const seqRef = useRef(0);

  const check = useCallback(async () => {
    const seq = ++seqRef.current;
    setChecking(true);
    try {
      const info = await fetchProductVersion();
      if (seq !== seqRef.current) {
        return;
      }
      setRemoteVersion(info.version);
      setMinAgentVersion(info.minAgentVersion);
    } catch {
      if (seq !== seqRef.current) {
        return;
      }
    } finally {
      if (seq === seqRef.current) {
        setChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      void check();
    }, 0);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void check();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const timer = setInterval(() => {
      void check();
    }, POLL_MS);

    return () => {
      clearTimeout(initial);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [check]);

  useEffect(() => {
    const onChunkStale = () => {
      setChunkStale(true);
    };
    window.addEventListener('pugying:spa-stale', onChunkStale);
    return () => {
      window.removeEventListener('pugying:spa-stale', onChunkStale);
    };
  }, []);

  const spaUpdateAvailable =
    PREVIEW_UPDATE_AVAILABLE ||
    (remoteVersion !== null && isVersionNewer(remoteVersion, PRODUCT_VERSION));

  const effectiveRemoteVersion = PREVIEW_UPDATE_AVAILABLE
    ? PREVIEW_REMOTE_VERSION
    : remoteVersion;

  const agentUpdateNeeded =
    minAgentVersion !== null &&
    agentVersion !== null &&
    status === 'connected' &&
    isVersionNewer(minAgentVersion, agentVersion);

  // 预览模式只点亮入口，不自动弹窗打扰
  const autoShowDialog =
    chunkStale ||
    (!PREVIEW_UPDATE_AVAILABLE &&
      spaUpdateAvailable &&
      remoteVersion !== null &&
      dismissedVersion !== remoteVersion);

  const open = autoShowDialog || manualOpen;

  const openManually = () => {
    void check();
    setManualOpen(true);
  };

  const dismiss = () => {
    if (effectiveRemoteVersion) {
      writeDismissedVersion(effectiveRemoteVersion);
      setDismissedVersion(effectiveRemoteVersion);
    }
    setChunkStale(false);
    setManualOpen(false);
  };

  const refresh = () => {
    window.location.reload();
  };

  return {
    open,
    checking,
    remoteVersion: effectiveRemoteVersion,
    chunkStale,
    spaUpdateAvailable,
    agentUpdateNeeded,
    minAgentVersion,
    localVersion: PRODUCT_VERSION,
    openManually,
    dismiss,
    refresh,
  };
}
