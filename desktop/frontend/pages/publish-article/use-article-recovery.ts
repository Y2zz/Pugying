import { useCallback, useEffect, useRef, useState } from "react";
import {
  packArticleRecovery,
  hasArticleRecoveryContent,
  equalArticleRecoveryData,
  readArticleRecovery,
  removeArticleRecovery,
  writeArticleRecovery,
  type ArticleRecoveryData,
  type ArticleRecoveryRecord,
} from "./article-recovery-store";

export function useArticleRecovery({
  key,
  enabled,
  baseUpdatedAt,
  data,
  onRestore,
  askBeforeRestore = false,
}: {
  key: string;
  enabled: boolean;
  baseUpdatedAt: string;
  data: ArticleRecoveryData;
  onRestore: (data: ArticleRecoveryData) => void;
  askBeforeRestore?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [pendingRecovery, setPendingRecovery] =
    useState<ArticleRecoveryRecord | null>(null);
  const [resolvingRecovery, setResolvingRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const resolving = useRef(false);
  const latest = useRef({ data, baseUpdatedAt, onRestore });
  latest.current = { data, baseUpdatedAt, onRestore };
  const savedData = useRef(data);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discarded = useRef(false);
  const readSucceeded = useRef(false);
  const mounted = useRef(true);
  const revision = useRef(0);
  const persist = useCallback(async () => {
    if (discarded.current || !readSucceeded.current) {
      return;
    }
    if (equalArticleRecoveryData(savedData.current, latest.current.data)) {
      return;
    }
    const current = latest.current;
    const version = ++revision.current;
    if (mounted.current) {
      setStatus("正在自动保存…");
      setFailed(false);
    }
    try {
      await writeArticleRecovery(key, {
        version: 1,
        updatedAt: Date.now(),
        baseUpdatedAt: current.baseUpdatedAt,
        data: packArticleRecovery(current.data),
      });
      savedData.current = current.data;
      if (mounted.current && version === revision.current) {
        setStatus(
          equalArticleRecoveryData(latest.current.data, current.data)
            ? "已自动保存到本机"
            : "等待自动保存…",
        );
      }
    } catch {
      if (mounted.current && version === revision.current) {
        setStatus("自动保存失败，请手动保存");
        setFailed(true);
      }
    }
  }, [key]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    let awaitingChoice = false;
    void readArticleRecovery(key)
      .then((record) => {
        if (cancelled) {
          return;
        }
        if (
          record?.version === 1 &&
          record.baseUpdatedAt === latest.current.baseUpdatedAt &&
          (!askBeforeRestore || hasArticleRecoveryContent(record.data))
        ) {
          if (askBeforeRestore) {
            awaitingChoice = true;
            setPendingRecovery(record);
            return;
          }
          savedData.current = record.data;
          latest.current.onRestore(record.data);
          setStatus("已恢复上次编辑内容");
        } else {
          savedData.current = latest.current.data;
        }
        readSucceeded.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("自动保存暂不可用，请手动保存");
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled && !awaitingChoice) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, askBeforeRestore]);

  const retry = useCallback(async () => {
    if (pendingRecovery) {
      return;
    }
    if (!readSucceeded.current) {
      // 读取失败时不覆盖可能已有的恢复副本；重试读取后再允许写入。
      try {
        const record = await readArticleRecovery(key);
        readSucceeded.current = true;
        if (
          record?.version === 1 &&
          record.baseUpdatedAt === latest.current.baseUpdatedAt &&
          (!askBeforeRestore || hasArticleRecoveryContent(record.data)) &&
          (askBeforeRestore ||
            equalArticleRecoveryData(savedData.current, latest.current.data))
        ) {
          if (askBeforeRestore) {
            setReady(false);
            readSucceeded.current = false;
            setPendingRecovery(record);
            setFailed(false);
            return;
          }
          savedData.current = record.data;
          latest.current.onRestore(record.data);
          setStatus("已恢复上次编辑内容");
          setFailed(false);
          return;
        } else {
          setStatus("自动保存已恢复");
        }
        setFailed(false);
      } catch {
        setStatus("自动保存暂不可用，请手动保存");
        setFailed(true);
        return;
      }
    }
    await persist();
  }, [key, persist, askBeforeRestore, pendingRecovery]);

  useEffect(() => {
    if (
      !ready ||
      !enabled ||
      !readSucceeded.current ||
      discarded.current ||
      equalArticleRecoveryData(savedData.current, data)
    ) {
      return;
    }
    setStatus("等待自动保存…");
    timer.current = setTimeout(() => {
      void persist();
    }, 800);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [data, ready, enabled, persist]);

  useEffect(() => {
    mounted.current = true;
    const flush = () => {
      if (enabled && ready) {
        void persist();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [enabled, ready, persist]);

  const continueRecovery = useCallback(() => {
    if (!pendingRecovery || resolving.current) {
      return;
    }
    savedData.current = pendingRecovery.data;
    latest.current.onRestore(pendingRecovery.data);
    readSucceeded.current = true;
    setPendingRecovery(null);
    setRecoveryError("");
    setStatus("已恢复上次编辑内容");
    setReady(true);
  }, [pendingRecovery]);

  const startNew = useCallback(async () => {
    if (!pendingRecovery || resolving.current) {
      return;
    }
    resolving.current = true;
    setResolvingRecovery(true);
    setRecoveryError("");
    try {
      await removeArticleRecovery(key);
      if (!mounted.current) {
        return;
      }
      savedData.current = latest.current.data;
      readSucceeded.current = true;
      setPendingRecovery(null);
      setStatus("");
      setReady(true);
    } catch {
      if (mounted.current) {
        setRecoveryError("新建失败，请重试或继续编辑");
      }
    } finally {
      resolving.current = false;
      if (mounted.current) {
        setResolvingRecovery(false);
      }
    }
  }, [key, pendingRecovery]);

  const discard = useCallback(async () => {
    discarded.current = true;
    if (timer.current) {
      clearTimeout(timer.current);
    }
    try {
      await removeArticleRecovery(key);
    } catch {
      discarded.current = false;
      throw new Error("恢复副本清理失败，请重试保存");
    }
  }, [key]);
  return {
    ready,
    status,
    failed,
    retry,
    discard,
    pendingRecovery,
    resolvingRecovery,
    recoveryError,
    continueRecovery,
    startNew,
  };
}
