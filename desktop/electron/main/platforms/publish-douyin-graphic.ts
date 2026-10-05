import { promises as fs } from 'fs';
import { BrowserWindow, session, type WebContents } from 'electron';
import { injectCookies } from '../auth-browser';
import { getPlatformAdapter } from './adapters';
import { fillDouyinGraphicMetadata, applyDouyinGraphicSettings } from './douyin-graphic-form';
import type { AgentCookie } from '../protocol';
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';

/** 创作者中心上传页；default-tab=3 一般为图文 Tab（改版时需实测校正） */
const GRAPHIC_UPLOAD_URL =
  'https://creator.douyin.com/creator-micro/content/upload?default-tab=3';
const EDITOR_WAIT_MS = 90_000;
const RESULT_WAIT_MS = 60_000;
/** 半自动：挂文件后留给用户的窗口保留时间 */
const MANUAL_HOLD_MS = 5 * 60_000;

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;

/**
 * 抖音图文发布（ephemeral session）：
 * 1) 校验多图路径 + 竖封面
 * 2) temp:publish-* 注入 Cookie
 * 3) 打开图文上传入口 → 注入图片 → 填标题/正文 → 尽量点发布
 * 4) 选择器失效时不伪造成功；可短暂保留窗口供人工收尾
 */
export function runDouyinGraphicPublish(options: {
  payload: PlatformPublishStartPayload;
  onProgress: ProgressFn;
  signal: { cancelled: boolean };
}): Promise<PlatformPublishResultPayload> {
  const { payload, onProgress, signal } = options;
  const base = {
    requestId: payload.requestId,
    targetId: payload.targetId,
    platform: payload.platform,
  };

  const emit = (
    phase: PlatformPublishProgressPayload['phase'],
    message?: string,
  ) => {
    if (signal.cancelled) {
      return;
    }
    onProgress({ ...base, phase, message });
  };

  return (async () => {
    emit('accepted');

    const adapter = getPlatformAdapter('douyin');
    if (!adapter) {
      return fail(base, 'unsupported_platform', '未找到抖音适配器');
    }

    let partition = '';
    let win: BrowserWindow | null = null;
    let keepWindowForManual = false;

    try {
      if (signal.cancelled) {
        return fail(base, 'cancelled', '已取消');
      }

      const imagePaths = resolveArticleImagePaths(payload);
      const coverPath = payload.coverPath?.trim() ?? '';
      if (imagePaths.length === 0) {
        return fail(base, 'invalid_payload', '缺少图文图片路径');
      }
      if (!coverPath) {
        return fail(base, 'invalid_payload', '缺少竖版封面路径');
      }

      emit('fetching_media', `校验本机图片（${imagePaths.length}）与封面`);
      for (const path of imagePaths) {
        await assertReadable(path);
      }
      await assertReadable(coverPath);

      if (signal.cancelled) {
        return fail(base, 'cancelled', '已取消');
      }

      emit('opening_creator', '打开创作者中心图文入口（临时会话）');
      partition = `temp:publish-${payload.requestId}`;
      const publishSession = session.fromPartition(partition, { cache: false });
      await injectCookies(publishSession, payload.cookies as AgentCookie[]);

      win = new BrowserWindow({
        width: 1280,
        height: 860,
        show: true,
        title: '蒲公英 · 抖音图文发布',
        webPreferences: {
          session: publishSession,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      await win.loadURL(GRAPHIC_UPLOAD_URL);
      await sleep(1800);
      await tryClickImageTab(win.webContents);

      if (signal.cancelled) {
        return fail(base, 'cancelled', '已取消');
      }

      const cookies = await publishSession.cookies.get({
        url: 'https://creator.douyin.com/',
      });
      const authed = adapter.isAuthed(
        cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expirationDate: c.expirationDate,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: String(c.sameSite ?? ''),
        })),
        win.webContents.getURL(),
      );

      if (!authed) {
        return fail(base, 'AUTH_EXPIRED', '抖音登录已失效，请重新授权媒体账号');
      }

      emit('uploading', `注入 ${imagePaths.length} 张图片`);
      const attached = await tryAttachImageFiles(win, imagePaths);
      if (!attached) {
        keepWindowForManual = true;
        return fail(
          base,
          'ADAPTER_UI_CHANGED',
          '未能定位抖音图文上传控件（创作者页改版时需更新适配器）。窗口已保留，可手动选图。',
        );
      }

      emit('uploading', '等待进入图文编辑页');
      const editorReady = await waitUntil(
        () => isEditorPage(win!),
        EDITOR_WAIT_MS,
        signal,
      );
      if (!editorReady) {
        keepWindowForManual = true;
        return fail(
          base,
          'ADAPTER_PARTIAL',
          '图片已挂载，但未在时限内进入编辑页；请在打开的窗口继续完成发布。',
        );
      }

      emit('submitting', '填写标题与正文');
      const metadataReady = await fillDouyinGraphicMetadata(win.webContents, payload);
      const settingsReady = metadataReady && await applyDouyinGraphicSettings(win.webContents, payload);
      if (!settingsReady) {
        keepWindowForManual = true;
        return fail(base, 'ADAPTER_PARTIAL', '部分发布设置未能完成，请在打开的窗口核对后发布');
      }

      if (payload.scheduledAt) {
        emit('submitting', `尝试设置平台定时 ${payload.scheduledAt}`);
        const scheduled = await tryEnableSchedule(win.webContents, payload.scheduledAt);
        if (!scheduled) {
          keepWindowForManual = true;
          return fail(base, 'ADAPTER_PARTIAL', '定时发布未能设置，请在打开的窗口核对时间');
        }
      }

      // 编辑页若有封面槽则挂竖封面；失败不阻断，留给半自动
      await tryAttachCoverFile(win, coverPath);

      emit('submitting', '点击发布');
      const clicked = await clickPublishButton(win.webContents);
      if (!clicked) {
        keepWindowForManual = true;
        return fail(
          base,
          'ADAPTER_PARTIAL',
          '已填写标题，但未找到「发布」按钮；请在打开的窗口手动点发布。',
        );
      }

      emit('submitting', '等待平台确认');
      const outcome = await waitForPublishOutcome(win, RESULT_WAIT_MS, signal);
      if (outcome.ok) {
        emit('done', '发布完成');
        return {
          ...base,
          ok: true,
          platformPostId: outcome.platformPostId,
          platformUrl: outcome.platformUrl,
        };
      }

      keepWindowForManual = true;
      return fail(
        base,
        outcome.errorCode ?? 'ADAPTER_PARTIAL',
        outcome.error ??
          '已点击发布，但未在时限内确认成功；请在打开的窗口核对结果。',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('MEDIA_MISSING:')) {
        return fail(
          base,
          'MEDIA_MISSING',
          message.replace(/^MEDIA_MISSING:\s*/, '') ||
            '源文件不可用，请重新选择图片或封面',
        );
      }
      if (signal.cancelled || message === 'cancelled') {
        return fail(base, 'cancelled', '已取消');
      }
      return fail(base, 'PUBLISH_FAILED', message);
    } finally {
      if (keepWindowForManual && win && !win.isDestroyed()) {
        const heldWin = win;
        const heldPartition = partition;
        win = null;
        partition = '';
        const cleanup = () => {
          if (!heldWin.isDestroyed()) {
            heldWin.destroy();
          }
          if (heldPartition) {
            void session
              .fromPartition(heldPartition, { cache: false })
              .clearStorageData()
              .catch(() => undefined);
          }
        };
        heldWin.once('closed', () => {
          if (heldPartition) {
            void session
              .fromPartition(heldPartition, { cache: false })
              .clearStorageData()
              .catch(() => undefined);
          }
        });
        setTimeout(cleanup, MANUAL_HOLD_MS);
      } else {
        if (win && !win.isDestroyed()) {
          win.destroy();
        }
        if (partition) {
          try {
            await session
              .fromPartition(partition, { cache: false })
              .clearStorageData();
          } catch {
            // ignore
          }
        }
      }
    }
  })();
}

function resolveArticleImagePaths(payload: PlatformPublishStartPayload): string[] {
  const fromList = (payload.mediaPaths ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  if (fromList.length > 0) {
    return fromList;
  }
  const single = payload.mediaPath?.trim();
  return single ? [single] : [];
}

function fail(
  base: { requestId: string; targetId: string; platform: string },
  errorCode: string,
  error: string,
): PlatformPublishResultPayload {
  return {
    ...base,
    ok: false,
    error,
    errorCode,
  };
}

async function assertReadable(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`MEDIA_MISSING: 源文件不可用，请重新选择：${filePath}`);
  }
}

/** 上传页可能仍停在视频 Tab，尽量点一次「图文」 */
async function tryClickImageTab(wc: WebContents): Promise<void> {
  try {
    await wc.executeJavaScript(`(() => {
      const nodes = Array.from(document.querySelectorAll('div, span, button, a, li'));
      const tab = nodes.find((n) => {
        const text = (n.textContent || '').replace(/\\s+/g, '');
        return text === '图文' || text === '发布图文';
      });
      if (tab) {
        tab.click();
      }
      return !!tab;
    })()`);
    await sleep(800);
  } catch {
    // ignore
  }
}

async function tryAttachImageFiles(
  win: BrowserWindow,
  imagePaths: string[],
): Promise<boolean> {
  return setFilesOnFirstMatchingInput(win, imagePaths, [
    'input[type="file"][accept*="image"]',
    'input[type="file"][accept*="jpeg"]',
    'input[type="file"][accept*="png"]',
    'input[type="file"][multiple]',
    'input[type="file"]',
  ]);
}

async function tryAttachCoverFile(
  win: BrowserWindow,
  coverPath: string,
): Promise<boolean> {
  return setFilesOnFirstMatchingInput(win, [coverPath], [
    'input[type="file"][accept*="image"]',
    'input[type="file"][accept*="jpeg"]',
    'input[type="file"][accept*="png"]',
  ]);
}

async function setFilesOnFirstMatchingInput(
  win: BrowserWindow,
  filePaths: string[],
  selectors: string[],
): Promise<boolean> {
  try {
    const wc = win.webContents;
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach('1.3');
    }
    const { root } = (await wc.debugger.sendCommand('DOM.getDocument', {
      depth: -1,
      pierce: true,
    })) as { root: { nodeId: number } };

    for (const selector of selectors) {
      const { nodeId } = (await wc.debugger.sendCommand('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      })) as { nodeId: number };
      if (!nodeId) {
        continue;
      }
      await wc.debugger.sendCommand('DOM.setFileInputFiles', {
        nodeId,
        files: filePaths,
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function isEditorPage(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) {
    return false;
  }
  const url = win.webContents.getURL();
  if (/content\/(post|publish|upload\/|edit)/i.test(url)) {
    return true;
  }
  try {
    return await win.webContents.executeJavaScript(`(() => {
      const text = document.body ? document.body.innerText : '';
      const hasTitle =
        !!document.querySelector('[contenteditable="true"]') ||
        !!document.querySelector('textarea') ||
        /作品描述|标题|添加作品描述|图文/.test(text);
      const hasPublish = /发布|定时发布/.test(text);
      return hasTitle && hasPublish;
    })()`);
  } catch {
    return false;
  }
}

async function tryEnableSchedule(wc: WebContents, scheduledAtIso: string): Promise<boolean> {
  const scheduled = new Date(scheduledAtIso);
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${scheduled.getFullYear()}-${pad(scheduled.getMonth() + 1)}-${pad(scheduled.getDate())}`;
  const time = `${pad(scheduled.getHours())}:${pad(scheduled.getMinutes())}`;
  try {
    const toggled = await wc.executeJavaScript(`(() => {
      const label = Array.from(document.querySelectorAll('label')).find((node) =>
        node.textContent.trim() === '定时发布' && node.querySelector('input[type="checkbox"]'));
      if (!label) { return false; }
      const input = label.querySelector('input');
      if (!input.checked) { label.click(); }
      return true;
    })()`);
    if (!toggled) {
      return false;
    }
    return await wc.executeJavaScript(`(() => {
      const values = [
        ['input[type="datetime-local"]', ${JSON.stringify(`${date}T${time}`)}],
        ['input[type="date"]', ${JSON.stringify(date)}],
        ['input[type="time"]', ${JSON.stringify(time)}],
      ];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setter) { return false; }
      let full = false;
      let dateSet = false;
      let timeSet = false;
      for (const [selector, value] of values) {
        const input = document.querySelector(selector);
        if (!input || input.disabled || input.readOnly) { continue; }
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (input.value !== value) { return false; }
        if (selector.includes('datetime-local')) { full = true; }
        if (selector.includes('type="date"')) { dateSet = true; }
        if (selector.includes('type="time"')) { timeSet = true; }
      }
      return full || (dateSet && timeSet);
    })()`);
  } catch {
    return false;
  }
}

async function clickPublishButton(wc: WebContents): Promise<boolean> {
  try {
    return await wc.executeJavaScript(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const candidates = buttons.filter((b) => {
        const text = (b.textContent || '').replace(/\\s+/g, '');
        const disabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
        return !disabled && (text === '发布' || text === '定时发布' || text.endsWith('发布'));
      });
      const exact = candidates.find((b) => (b.textContent || '').replace(/\\s+/g, '') === '发布')
        || candidates.find((b) => (b.textContent || '').replace(/\\s+/g, '') === '定时发布')
        || candidates[0];
      if (!exact) {
        return false;
      }
      exact.click();
      return true;
    })()`);
  } catch {
    return false;
  }
}

async function waitForPublishOutcome(
  win: BrowserWindow,
  timeoutMs: number,
  signal: { cancelled: boolean },
): Promise<{
  ok: boolean;
  platformPostId?: string;
  platformUrl?: string;
  errorCode?: string;
  error?: string;
}> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (signal.cancelled) {
      return { ok: false, errorCode: 'cancelled', error: '已取消' };
    }
    if (win.isDestroyed()) {
      return {
        ok: false,
        errorCode: 'ADAPTER_PARTIAL',
        error: '发布窗口已关闭，未能确认平台回执',
      };
    }
    try {
      const snap = await win.webContents.executeJavaScript(`(() => {
        const url = location.href;
        const text = document.body ? document.body.innerText : '';
        const ok =
          /发布成功|作品发布成功|已发布/.test(text) ||
          /\\/content\\/manage|\\/content\\/works|\\/note\\//.test(url);
        const authLost = /登录|重新登录|扫码/.test(text) && /失效|过期|重新/.test(text);
        return { url, ok, authLost };
      })()`);
      if (snap.authLost) {
        return {
          ok: false,
          errorCode: 'AUTH_EXPIRED',
          error: '发布过程中登录失效',
        };
      }
      if (snap.ok) {
        return {
          ok: true,
          platformUrl: snap.url,
          platformPostId: extractIdFromUrl(snap.url),
        };
      }
    } catch {
      // page navigating
    }
    await sleep(1000);
  }
  return {
    ok: false,
    errorCode: 'ADAPTER_PARTIAL',
    error: '等待发布结果超时',
  };
}

function extractIdFromUrl(url: string): string | undefined {
  const match = url.match(/(\d{8,})/);
  return match?.[1];
}

async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  signal: { cancelled: boolean },
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (signal.cancelled) {
      return false;
    }
    if (await check()) {
      return true;
    }
    await sleep(1000);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
