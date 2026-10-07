// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useLocalImagePreview } from "./use-local-image-preview";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("切换图片后忽略旧图片的迟到结果", async () => {
  let resolveFirst!: (value: string) => void;
  const readImage = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce("data:image/png;base64,bmV3");
  vi.stubGlobal("pugyingDesktop", {
    available: true,
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    readLocalImageDataUrl: readImage,
  });
  const { result, rerender } = renderHook(
    ({ path }) => useLocalImagePreview(path),
    {
      initialProps: { path: "/tmp/first.png" },
    },
  );
  rerender({ path: "/tmp/second.png" });
  await waitFor(() =>
    expect(result.current).toBe("data:image/png;base64,bmV3"),
  );
  await act(async () => {
    resolveFirst("data:image/png;base64,b2xk");
  });
  expect(result.current).toBe("data:image/png;base64,bmV3");
});

it("没有桌面接口时返回读取失败", async () => {
  vi.stubGlobal("pugyingDesktop", undefined);
  const { result } = renderHook(() => useLocalImagePreview("/tmp/image.png"));
  await waitFor(() => expect(result.current).toBeNull());
});
