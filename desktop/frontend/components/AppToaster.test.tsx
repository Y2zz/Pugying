// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { AppToaster, toast } from "./AppToaster";
import { toast as articleToast } from "@/lib/app-toast";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  act(() => {
    toast.close();
  });
  cleanup();
  vi.unstubAllGlobals();
});

it("shows global article notifications using the official toaster", () => {
  render(<AppToaster />);
  act(() => {
    articleToast.add({ type: "error", title: "标题未填写" });
  });
  expect(screen.getByText("标题未填写")).toBeTruthy();
  expect(articleToast).toBe(toast);
  expect(document.querySelector("[data-app-toast-viewport]")).toBeNull();
});
