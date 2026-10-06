// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ArticleCoverEditDialog } from "./ArticleCoverEditDialog";

const source = "data:image/png;base64,aW1hZ2U=";
const drawImage = vi.fn();

beforeEach(() => {
  drawImage.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob(["cover"], { type: "image/jpeg" })),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function loadPreview() {
  const image = screen.getByAltText("图片裁剪预览");
  Object.defineProperties(image, {
    naturalWidth: { value: 800 },
    naturalHeight: { value: 600 },
  });
  fireEvent.load(image);
  return image;
}

it.each([
  ["portrait", 175, 0, 450, 600],
  ["landscape", 0, 0, 800, 600],
] as const)(
  "exports a %s cover at the required ratio without writing a local article image",
  async (aspect, x, y, width, height) => {
    const saved = vi.fn();
    const close = vi.fn();
    render(
      <ArticleCoverEditDialog
        aspect={aspect}
        initialSourceUrl={source}
        onClose={close}
        onSaved={saved}
      />,
    );
    const image = loadPreview();
    expect(screen.queryByRole("group", { name: "裁剪比例" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(drawImage).toHaveBeenCalledWith(
      image,
      x,
      y,
      width,
      height,
      0,
      0,
      width,
      height,
    );
    expect(saved.mock.calls[0][0]).toMatchObject({
      sourceUrl: source,
      sourceFrameTime: null,
    });
    expect(saved.mock.calls[0][0].croppedFile).toBeInstanceOf(File);
    expect(saved.mock.calls[0][0].croppedFile.type).toBe("image/jpeg");
    expect(close).toHaveBeenCalledOnce();
  },
);

it("keeps the fixed ratio when resizing a corner, and resets to the centered cover", async () => {
  const saved = vi.fn();
  render(
    <ArticleCoverEditDialog
      aspect="portrait"
      initialSourceUrl={source}
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  const image = loadPreview();
  vi.stubGlobal("PointerEvent", MouseEvent);
  const stage = image.parentElement!;
  Object.defineProperty(stage, "getBoundingClientRect", {
    value: () => new DOMRect(0, 0, 400, 300),
  });
  Object.defineProperty(stage, "setPointerCapture", { value: vi.fn() });
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "调整裁剪框右下角" }),
    { clientX: 312.5, clientY: 300 },
  );
  fireEvent.pointerMove(stage, { clientX: 250, clientY: 200 });
  fireEvent.pointerUp(stage, { clientX: 250, clientY: 200 });
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  const args = drawImage.mock.calls[0];
  expect(args[3] / args[4]).toBeCloseTo(3 / 4);
  expect(args[3]).toBeLessThan(450);
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
  expect(drawImage).toHaveBeenLastCalledWith(
    image,
    175,
    0,
    450,
    600,
    0,
    0,
    450,
    600,
  );
});

it("starts with image selection and canceling never saves a cover", () => {
  const saved = vi.fn();
  const close = vi.fn();
  render(
    <ArticleCoverEditDialog
      aspect="portrait"
      initialSourceUrl={null}
      onClose={close}
      onSaved={saved}
    />,
  );
  expect(screen.queryByRole("button", { name: "确定" })).toBeNull();
  expect(screen.queryByRole("button", { name: "重置" })).toBeNull();
  expect(screen.getByText("选图后可调整构图，封面比例为 3:4。")).toBeTruthy();
  expect(screen.getByText("图片大小不超过 20MB")).toBeTruthy();
  expect(screen.getByRole("button", { name: "选择图片" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(close).toHaveBeenCalledOnce();
  expect(saved).not.toHaveBeenCalled();
});

it("loads a selected image and retains its source for subsequent editing", async () => {
  const saved = vi.fn();
  render(
    <ArticleCoverEditDialog
      aspect="landscape"
      initialSourceUrl={null}
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByLabelText("选择封面图片"), {
    target: {
      files: [new File(["image"], "cover.png", { type: "image/png" })],
    },
  });
  await waitFor(() => expect(screen.getByAltText("图片裁剪预览")).toBeTruthy());
  loadPreview();
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(saved.mock.calls[0][0].sourceUrl).toMatch(/^data:image\/png;base64,/);
});

it.each(["cancel", "click"] as const)(
  "keeps the existing cover crop after a pointer %s",
  async (action) => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const saved = vi.fn();
    render(
      <ArticleCoverEditDialog
        aspect="portrait"
        initialSourceUrl={source}
        onClose={vi.fn()}
        onSaved={saved}
      />,
    );
    const image = loadPreview();
    const stage = image.parentElement!;
    Object.defineProperty(stage, "getBoundingClientRect", {
      value: () => new DOMRect(0, 0, 400, 300),
    });
    Object.defineProperty(stage, "setPointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 60 });
    if (action === "cancel") {
      fireEvent.pointerMove(stage, { clientX: 200, clientY: 150 });
      fireEvent.pointerCancel(stage);
    } else {
      fireEvent.pointerUp(stage, { clientX: 40, clientY: 60 });
    }
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(drawImage).toHaveBeenCalledWith(
      image,
      175,
      0,
      450,
      600,
      0,
      0,
      450,
      600,
    );
  },
);

it("returns to image selection when the previous cover cannot be loaded", () => {
  render(
    <ArticleCoverEditDialog
      aspect="portrait"
      initialSourceUrl={source}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  fireEvent.error(screen.getByAltText("图片裁剪预览"));
  expect(screen.getByText("重新选择封面图片")).toBeTruthy();
  expect(screen.getByText("图片无法读取，请选择另一张图片。")).toBeTruthy();
  expect(screen.getByRole("button", { name: "选择图片" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "确定" })).toBeNull();
});
