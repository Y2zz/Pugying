import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  DistributionPage,
  DistributionSnapshot,
} from "@shared/distribution";
import { fetchDistributionPage } from "@/lib/api";
import { getPugyingDesktopBridge } from "@/lib/agent-client";

const emptyPage: DistributionPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  counts: { active: 0, waiting: 0, attention: 0, completed: 0 },
};
interface DistributionState {
  snapshot: DistributionSnapshot | null;
  activePage: DistributionPage;
  loading: boolean;
  hasRead: boolean;
  error: string;
  version: number;
  refresh: () => void;
}
const Context = createContext<DistributionState>({
  snapshot: null,
  activePage: emptyPage,
  loading: true,
  hasRead: false,
  error: "",
  version: 0,
  refresh: () => undefined,
});

/** 页面共享一次订阅；主进程负责执行，界面只读取快照和已保存的任务。 */
export function DistributionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<DistributionState, "refresh">>({
    snapshot: null,
    activePage: emptyPage,
    loading: true,
    hasRead: false,
    error: "",
    version: 0,
  });
  const refreshRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    let alive = true;
    let fetching = false;
    let pending = false;
    let snapshotSequence = 0;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const bridge = getPugyingDesktopBridge();
    const readSnapshot = async () => {
      const sequence = ++snapshotSequence;
      const snapshot = await (bridge?.getDistributionSnapshot?.() ??
        Promise.resolve(null));
      if (alive && sequence === snapshotSequence) {
        setState((previous) => ({ ...previous, snapshot }));
      }
      return snapshot;
    };
    const refresh = async () => {
      // 阶段快照独立更新，结果查询缓慢时也能看到上传和保存结果的进度。
      const currentSnapshot = readSnapshot();
      if (fetching) {
        pending = true;
        void currentSnapshot.catch(() => {
          if (alive) {
            setState((previous) => ({
              ...previous,
              error: "分发状态更新失败，请重试",
            }));
          }
        });
        return;
      }
      fetching = true;
      const [page, snapshot] = await Promise.allSettled([
        fetchDistributionPage(),
        currentSnapshot,
      ]);
      if (alive) {
        setState((previous) => ({
          activePage:
            page.status === "fulfilled" ? page.value : previous.activePage,
          snapshot: previous.snapshot,
          loading: false,
          hasRead: previous.hasRead || page.status === "fulfilled",
          error:
            page.status === "rejected" || snapshot.status === "rejected"
              ? "分发状态更新失败，请重试"
              : bridge && !bridge.getDistributionSnapshot
                ? "重启应用后可查看实时分发进度"
                : "",
          version: previous.version + 1,
        }));
      }
      fetching = false;
      if (pending && alive) {
        pending = false;
        void refresh();
      }
    };
    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        void refresh();
      }, 80);
    };
    refreshRef.current = () => {
      void refresh();
    };
    const unsubscribe = bridge?.onDistributionChanged?.(schedule);
    const wake = () => {
      if (!document.hidden) {
        void refresh();
      }
    };
    const interval = setInterval(wake, 3000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    void refresh();
    return () => {
      alive = false;
      clearTimeout(debounce);
      clearInterval(interval);
      unsubscribe?.();
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      refreshRef.current = () => undefined;
    };
  }, []);
  return (
    <Context.Provider value={{ ...state, refresh: () => refreshRef.current() }}>
      {children}
    </Context.Provider>
  );
}
export function useDistributionState() {
  return useContext(Context);
}
