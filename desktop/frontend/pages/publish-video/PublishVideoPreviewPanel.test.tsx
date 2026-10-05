// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PublishVideoPreviewPanel } from "./PublishVideoPreviewPanel";

afterEach(cleanup);

function setup(
  overrides: Partial<Parameters<typeof PublishVideoPreviewPanel>[0]> = {},
) {
  const pick = vi.fn();
  const cancel = vi.fn();
  const props = {
    videoSectionRef: { current: null },
    videoInputRef: { current: null },
    showAssetBar: true,
    hasVideo: true,
    videoFileName: "测试.mp4",
    videoFileSize: 1024,
    videoPreviewUrl: "blob:video",
    dragOver: false,
    disabled: false,
    uploading: false,
    uploadMetrics: null,
    onPickClick: pick,
    onFileChange: vi.fn(),
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onCancelUpload: cancel,
    ...overrides,
  };
  const view = render(<PublishVideoPreviewPanel {...props} />);
  return { ...view, pick, cancel };
}

it("素材默认只显示信息条，点击预览才挂载播放器，关闭后卸载", async () => {
  const { container, pick } = setup();
  expect(screen.getByText("测试.mp4")).toBeTruthy();
  expect(container.querySelector("video[controls]")).toBeNull();
  const metadata = container.querySelector("video")!;
  Object.defineProperty(metadata, "duration", {
    configurable: true,
    value: 125,
  });
  fireEvent.loadedMetadata(metadata);
  expect(screen.getByText(/2:05/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "更换视频" }));
  expect(pick).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "预览", exact: true }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.querySelector("video[controls]")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(document.querySelector("video[controls]")).toBeNull(),
  );
});

it("处理期间显示进度并保留取消操作，禁止更换和预览", () => {
  const { cancel } = setup({
    uploading: true,
    uploadMetrics: {
      phase: "video",
      loadedBytes: 512,
      totalBytes: 1024,
      ratio: 0.5,
      speedBps: 128,
    },
  });
  expect(screen.getByText(/50%/)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "预览" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "更换视频" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "取消处理" }));
  expect(cancel).toHaveBeenCalledOnce();
});

it("更换素材后清除旧时长，初始状态仍提供拖入选择入口", () => {
  const { container, rerender } = setup();
  const metadata = container.querySelector("video")!;
  Object.defineProperty(metadata, "duration", {
    configurable: true,
    value: 125,
  });
  fireEvent.loadedMetadata(metadata);
  const props = {
    videoSectionRef: { current: null },
    videoInputRef: { current: null },
    showAssetBar: false,
    hasVideo: false,
    videoFileName: "",
    videoFileSize: null,
    videoPreviewUrl: null,
    dragOver: false,
    disabled: false,
    uploading: false,
    uploadMetrics: null,
    onPickClick: vi.fn(),
    onFileChange: vi.fn(),
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onCancelUpload: vi.fn(),
  };
  rerender(
    <PublishVideoPreviewPanel
      {...props}
      showAssetBar
      videoFileName="新视频.mp4"
      videoPreviewUrl="blob:new"
    />,
  );
  expect(screen.queryByText(/2:05/)).toBeNull();
  rerender(<PublishVideoPreviewPanel {...props} />);
  expect(screen.getByRole("button", { name: /拖入或选择视频/ })).toBeTruthy();
});
