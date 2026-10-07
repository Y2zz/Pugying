// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  DistributionProvider,
  useDistributionState,
} from "./DistributionProvider";
const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  snapshot: vi.fn(),
  changed: null as (() => void) | null,
  unsubscribe: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ fetchDistributionPage: mocks.page }));
vi.mock("@/lib/agent-client", () => ({
  getPugyingDesktopBridge: () => ({
    getDistributionSnapshot: mocks.snapshot,
    onDistributionChanged: (fn: () => void) => {
      mocks.changed = fn;
      return mocks.unsubscribe;
    },
  }),
}));
const page = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  counts: { active: 1, waiting: 2, attention: 0, completed: 0 },
};
function Status({ name }: { name: string }) {
  const state = useDistributionState();
  return (
    <p>
      {name}:{state.snapshot?.revision ?? "loading"}:
      {state.activePage.counts.waiting}:{state.error}
    </p>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.page.mockResolvedValue(page);
  mocks.snapshot.mockResolvedValue({ revision: 1, concurrency: 3, tasks: [] });
});
afterEach(cleanup);
it("updates live phases while a persisted result request is still pending", async () => {
  const delayed = Promise.withResolvers<typeof page>();
  mocks.page.mockReturnValueOnce(delayed.promise);
  render(
    <DistributionProvider>
      <Status name="sidebar" />
    </DistributionProvider>,
  );
  await screen.findByText("sidebar:1:0:");
  mocks.snapshot.mockResolvedValue({ revision: 2, concurrency: 3, tasks: [] });
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await screen.findByText("sidebar:2:0:");
  expect(mocks.page).toHaveBeenCalledOnce();
  delayed.resolve(page);
  await screen.findByText("sidebar:2:2:");
});
it("shares one observer across pages and recovers the current snapshot after navigation and visibility changes", async () => {
  const { rerender, unmount } = render(
    <DistributionProvider>
      <Status name="sidebar" />
      <Status name="page-a" />
    </DistributionProvider>,
  );
  await screen.findByText("sidebar:1:2:");
  expect(mocks.page).toHaveBeenCalledTimes(1);
  rerender(
    <DistributionProvider>
      <Status name="sidebar" />
      <Status name="page-b" />
    </DistributionProvider>,
  );
  expect(screen.getByText("page-b:1:2:")).toBeTruthy();
  mocks.snapshot.mockResolvedValue({ revision: 2, concurrency: 4, tasks: [] });
  act(() => {
    mocks.changed?.();
  });
  await screen.findByText("sidebar:2:2:");
  mocks.snapshot.mockResolvedValue({ revision: 3, concurrency: 4, tasks: [] });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await screen.findByText("page-b:3:2:");
  unmount();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("retains the last readable state on failure and clears the stale notice after recovery", async () => {
  render(
    <DistributionProvider>
      <Status name="sidebar" />
    </DistributionProvider>,
  );
  await screen.findByText("sidebar:1:2:");
  mocks.page.mockRejectedValue(new Error("private technical detail"));
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await screen.findByText("sidebar:1:2:分发状态更新失败，请重试");
  expect(screen.queryByText(/private technical detail/)).toBeNull();
  mocks.page.mockResolvedValue(page);
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => expect(screen.getByText("sidebar:1:2:")).toBeTruthy());
});
