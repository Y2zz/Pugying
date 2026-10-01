import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_IPC } from '@shared/desktop-ipc';
import { wireDesktopIpc } from './app-ipc';
import { setAppWindow } from './app-window-state';

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
  mainWindow = new BrowserWindow({});
  setAppWindow(mainWindow);
  directory = await mkdtemp(join(tmpdir(), 'pugying-article-image-'));
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
