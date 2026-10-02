import { app, BrowserWindow, ipcMain, type WebContents } from 'electron';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_IPC } from '@shared/desktop-ipc';
import { wireDesktopIpc } from './app-ipc';
import { setAppWindow } from './app-window-state';

const { showSaveDialog } = vi.hoisted(() => ({ showSaveDialog: vi.fn() }));
vi.mock('electron', async (importOriginal) => ({
  ...(await importOriginal<typeof import('electron')>()),
  dialog: { showSaveDialog },
}));

vi.mock('./desktop-bridge', () => ({
  handleBridgeMessage: vi.fn(),
  registerBridgeClient: vi.fn(),
}));
vi.mock('./server-process', () => ({
  getApiBaseUrl: vi.fn(),
  getLocalApiToken: vi.fn(),
}));
vi.mock('./product-logo', () => ({ getProductLogoNativeImage: vi.fn() }));

type ReadImage = (
  event: { sender: WebContents },
  path: unknown,
) => Promise<string | null>;
let readImage: ReadImage;
let saveImage: (
  event: { sender: WebContents },
  data: unknown,
  source: unknown,
) => Promise<string | null>;
let imagePath: string;
let directory: string;
let mainWindow: BrowserWindow;
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64');

beforeAll(async () => {
  const registrations = vi.spyOn(ipcMain, 'handle');
  wireDesktopIpc();
  readImage = registrations.mock.calls.find(
    ([channel]) => channel === DESKTOP_IPC.readLocalImageDataUrl,
  )![1] as ReadImage;
  saveImage = registrations.mock.calls.find(
    ([channel]) => channel === DESKTOP_IPC.saveArticleImage,
  )![1] as typeof saveImage;
  mainWindow = new BrowserWindow({});
  setAppWindow(mainWindow);
  directory = await mkdtemp(join(tmpdir(), 'pugying-article-image-'));
  vi.spyOn(app, 'getPath').mockImplementation(() => directory);
  imagePath = join(directory, '正文 图片.png');
  await writeFile(imagePath, imageBytes);
});

afterAll(async () => {
  setAppWindow(null);
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it('reads a local image for the business window without loading a file URL in the renderer', async () => {
  await expect(
    readImage({ sender: mainWindow.webContents }, imagePath),
  ).resolves.toBe(`data:image/png;base64,${imageBytes.toString('base64')}`);
});

it('does not expose local image bytes to another window', async () => {
  const otherWindow = new BrowserWindow({});
  await expect(
    readImage({ sender: otherWindow.webContents }, imagePath),
  ).resolves.toBeNull();
});

it('returns null for a missing file, relative path, or unsupported file', async () => {
  const event = { sender: mainWindow.webContents };
  await expect(
    readImage(event, join(directory, 'missing.png')),
  ).resolves.toBeNull();
  await expect(readImage(event, '正文 图片.png')).resolves.toBeNull();
  const textPath = join(directory, 'notes.txt');
  await writeFile(textPath, 'notes');
  await expect(readImage(event, textPath)).resolves.toBeNull();
});

it('saves a crop as a new local file without opening a save dialog or overwriting the source', async () => {
  showSaveDialog.mockClear();
  const data = `data:image/png;base64,${imageBytes.toString('base64')}`;
  const path = await saveImage(
    { sender: mainWindow.webContents },
    data,
    imagePath,
  );
  expect(path).toContain(join(directory, 'article-images'));
  expect(await readFile(path!)).toEqual(imageBytes);
  expect(await readFile(imagePath)).toEqual(imageBytes);
  expect(showSaveDialog).not.toHaveBeenCalled();
  const second = await saveImage(
    { sender: mainWindow.webContents },
    data,
    imagePath,
  );
  expect(second).not.toBe(path);
});

it('still lets pasted images be saved explicitly and refuses to overwrite an existing file', async () => {
  const path = join(directory, 'pasted.png');
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: path });
  const data = `data:image/png;base64,${imageBytes.toString('base64')}`;
  await expect(
    saveImage({ sender: mainWindow.webContents }, data, ''),
  ).resolves.toBe(path);
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: imagePath });
  await expect(
    saveImage({ sender: mainWindow.webContents }, data, ''),
  ).rejects.toThrow();
  expect(await readFile(imagePath)).toEqual(imageBytes);
});

it('does not save when canceled, called by another window, or passed invalid bytes', async () => {
  const data = `data:image/png;base64,${imageBytes.toString('base64')}`;
  showSaveDialog.mockResolvedValue({ canceled: true });
  await expect(
    saveImage({ sender: mainWindow.webContents }, data, ''),
  ).resolves.toBeNull();
  showSaveDialog.mockClear();
  const other = new BrowserWindow({});
  await expect(
    saveImage({ sender: other.webContents }, data, imagePath),
  ).resolves.toBeNull();
  await expect(
    saveImage(
      { sender: mainWindow.webContents },
      'data:image/png;base64,YWJj',
      imagePath,
    ),
  ).resolves.toBeNull();
  expect(showSaveDialog).not.toHaveBeenCalled();
});
