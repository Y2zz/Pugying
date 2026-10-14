// @vitest-environment jsdom
import { createRef, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { GraphicDocument } from "./GraphicDocument";

const path = "/tmp/图文 图片 #1%.png";
const source = "data:image/png;base64,aW1hZ2U=";
const readImage = vi.fn();
const saveImage = vi.fn();

function Document({
  initialPaths = [],
  disabled = false,
  onChange,
}: {
  initialPaths?: string[];
  disabled?: boolean;
  onChange?: (paths: string[]) => void;
}) {
  const [paths, setPaths] = useState(initialPaths);
  return (
    <GraphicDocument
      title="标题"
      onTitleChange={() => {}}
      titleMax={30}
      body="文案"
      onBodyChange={() => {}}
      bodyMin={0}
      bodyMax={1000}
      mediaPaths={paths}
      onMediaPathsChange={(next) => {
        setPaths(next);
        onChange?.(next);
      }}
      pathWarning={null}
      disabled={disabled}
      titleRef={createRef()}
      bodyRef={createRef()}
      imagesRef={createRef()}
      imageInputRef={createRef()}
    />
  );
}

beforeEach(() => {
  readImage.mockReset().mockResolvedValue(source);
  saveImage.mockReset().mockResolvedValue("/tmp/cropped.png");
  vi.stubGlobal("pugyingDesktop", {
    available: true,
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    getPathForFile: () => path,
    readLocalImageDataUrl: readImage,
    saveArticleImage: saveImage,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("添加图片后读取本机预览，去重并允许移除后重新添加", async () => {
  const { container } = render(<Document />);
  const input = screen.getByLabelText("添加图片");
  const file = new File(["image"], "图文 图片 #1%.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file, file] } });
  await waitFor(() =>
    expect(container.querySelector("img")?.getAttribute("src")).toBe(source),
  );
  expect(readImage).toHaveBeenCalledWith(path);
  expect(container.querySelectorAll("img")).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "移除图片" }));
  expect(container.querySelector("img")).toBeNull();
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() =>
    expect(container.querySelector("img")?.getAttribute("src")).toBe(source),
  );
});

it("重新打开草稿时按路径恢复图片预览", async () => {
  const { container } = render(<Document initialPaths={[path]} />);
  await waitFor(() =>
    expect(container.querySelector("img")?.getAttribute("src")).toBe(source),
  );
  expect(readImage).toHaveBeenCalledWith(path);
});

it.each([null, new Error("read failed")])(
  "无法读取图片时提示重新选择：%s",
  async (failure) => {
    if (failure instanceof Error) {
      readImage.mockRejectedValue(failure);
    } else {
      readImage.mockResolvedValue(failure);
    }
    const { container } = render(<Document initialPaths={[path]} />);
    expect(await screen.findByText("图片无法显示，请重新选择")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "移除图片" })).toBeTruthy();
  },
);

it("图片内容无法解码时显示提示", async () => {
  const { container } = render(<Document initialPaths={[path]} />);
  await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
  fireEvent.error(container.querySelector("img")!);
  expect(screen.getByText("图片无法显示，请重新选择")).toBeTruthy();
});

const paths = ["/tmp/a.png", "/tmp/b.png", "/tmp/c.png"];
const imageSource = (path: string) => `data:image/png;base64,${btoa(path)}`;

it("拖放改变图片顺序，取消拖放不会改变顺序", async () => {
  readImage.mockImplementation(async (path) => imageSource(path));
  const { container } = render(<Document initialPaths={paths} />);
  await waitFor(() =>
    expect(container.querySelectorAll("img")).toHaveLength(3),
  );
  const items = () =>
    screen.getAllByRole("listitem", { name: /^第 \d+ 张图片$/ });
  const order = () =>
    Array.from(container.querySelectorAll("li img"), (image) =>
      image.getAttribute("src"),
    );
  const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
  fireEvent.dragStart(items()[0], { dataTransfer });
  fireEvent.dragOver(items()[2], { dataTransfer });
  fireEvent.drop(items()[2], { dataTransfer });
  expect(order()).toEqual([paths[1], paths[2], paths[0]].map(imageSource));
  fireEvent.dragStart(items()[2], { dataTransfer });
  fireEvent.dragOver(items()[0], { dataTransfer });
  fireEvent.drop(items()[0], { dataTransfer });
  expect(order()).toEqual(paths.map(imageSource));
  fireEvent.dragStart(items()[0], { dataTransfer });
  fireEvent.dragOver(items()[1], { dataTransfer });
  fireEvent.dragEnd(items()[0]);
  expect(order()).toEqual(paths.map(imageSource));
});

it("方向键可以调整顺序，外部拖放不会改变图片", async () => {
  readImage.mockImplementation(async (path) => imageSource(path));
  const { container } = render(<Document initialPaths={paths} />);
  await waitFor(() =>
    expect(container.querySelectorAll("img")).toHaveLength(3),
  );
  fireEvent.keyDown(screen.getByRole("listitem", { name: "第 2 张图片" }), {
    key: "ArrowLeft",
  });
  const order = () =>
    Array.from(container.querySelectorAll("li img"), (image) =>
      image.getAttribute("src"),
    );
  expect(order()).toEqual([paths[1], paths[0], paths[2]].map(imageSource));
  fireEvent.keyDown(screen.getByRole("button", { name: "裁剪第 1 张图片" }), {
    key: "ArrowRight",
  });
  expect(order()).toEqual([paths[1], paths[0], paths[2]].map(imageSource));
  fireEvent.drop(
    screen.getAllByRole("listitem", { name: /^第 \d+ 张图片$/ })[2],
  );
  expect(order()).toEqual([paths[1], paths[0], paths[2]].map(imageSource));
});

it("锁定时不能排序或裁剪", async () => {
  const { container } = render(<Document initialPaths={paths} disabled />);
  await waitFor(() =>
    expect(container.querySelectorAll("img")).toHaveLength(3),
  );
  expect(screen.getAllByRole("listitem").every((item) => !item.draggable)).toBe(
    true,
  );
  expect(
    screen
      .getByRole("button", { name: "裁剪第 1 张图片" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

async function openCrop() {
  fireEvent.click(
    await screen.findByRole("button", { name: "裁剪第 1 张图片" }),
  );
  const image = screen.getByAltText("图片裁剪预览");
  Object.defineProperties(image, {
    naturalWidth: { value: 800 },
    naturalHeight: { value: 600 },
  });
  await act(async () => {
    fireEvent.load(image);
  });
  return image;
}

it("只缩放图片，裁剪框保持固定且保存缩放后的画面", async () => {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(source);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 500,
    bottom: 300,
    width: 500,
    height: 300,
    toJSON: () => ({}),
  });
  const onChange = vi.fn();
  render(<Document initialPaths={[path, ...paths]} onChange={onChange} />);
  const image = await openCrop();
  const surface = screen.getByRole("group", { name: "图片裁剪区域" });
  const originalWidth = parseFloat(surface.style.width);
  expect(originalWidth).toBe(500);
  expect(surface.style.height).toBe("300px");
  expect(image.style.width).toBe("400px");
  expect(image.style.height).toBe("300px");
  expect(image.style.left).toBe("50px");
  expect(image.style.top).toBe("0px");
  fireEvent.click(screen.getByRole("button", { name: "1:1" }));
  const cropFrame = screen.getByRole("button", {
    name: "移动图片",
  }).parentElement!;
  const originalFrame = cropFrame.getAttribute("style");
  expect(cropFrame.style.left).toBe("100px");
  expect(cropFrame.style.top).toBe("0px");
  expect(cropFrame.style.width).toBe("300px");
  expect(cropFrame.style.height).toBe("300px");
  fireEvent.change(await screen.findByRole("slider", { name: /图片缩放/ }), {
    target: { value: "200" },
  });
  expect(parseFloat(surface.style.width)).toBe(originalWidth);
  expect(cropFrame.getAttribute("style")).toBe(originalFrame);
  expect(image.style.transform).toBe("translate(0%, 0%) scale(2)");
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(saveImage).toHaveBeenCalledWith(source, path));
  expect(drawImage).toHaveBeenCalledWith(
    image,
    250,
    150,
    300,
    300,
    0,
    0,
    600,
    600,
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(readImage).toHaveBeenCalledWith("/tmp/cropped.png");
  expect(onChange).toHaveBeenLastCalledWith(["/tmp/cropped.png", ...paths]);
  expect(
    screen.getAllByRole("listitem", { name: /^第 \d+ 张图片$/ }),
  ).toHaveLength(4);
});

it("取消裁剪不保存图片，保存失败时可重试", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(source);
  render(<Document initialPaths={[path]} />);
  await openCrop();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(saveImage).not.toHaveBeenCalled();
  saveImage.mockResolvedValueOnce(null);
  await openCrop();
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(saveImage).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "确定" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(saveImage).toHaveBeenCalledTimes(2);
});
