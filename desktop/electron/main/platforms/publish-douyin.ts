import { createWriteStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BrowserWindow, net, session, type WebContents } from 'electron';
import { injectCookies } from '../auth-browser';
import { getPlatformAdapter } from './adapters';
import type { AgentCookie } from '../protocol';
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from '../publish-protocol';

const UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';
/** 上传后进入编辑页的最长等待 */
const EDITOR_WAIT_MS = 90_000;
/** 点击发布后等待结果 */
const RESULT_WAIT_MS = 60_000;
/** 半自动：挂文件后留给用户的窗口保留时间 */
const MANUAL_HOLD_MS = 5 * 60_000;

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;

/**
 * Douyin short-video publish (ephemeral session):
 * 1) signed URL 拉视频/封面
 * 2) temp:publish-* 注入 Cookie
 * 3) 挂载 video input → 等编辑页 → 填标题/简介 → 点发布
 * 4) 选择器失效时不伪造成功；可短暂保留窗口供人工收尾
 */
export function runDouyinPublish(options: {
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

    const workDir = join(tmpdir(), `pugying-publish-${payload.requestId}`);
    await fs.mkdir(workDir, { recursive: true });

    let partition = '';
    let win: BrowserWindow | null = null;
    let keepWindowForManual = false;

    try {
      if (signal.cancelled) {
        return fail(base, 'cancelled', '已取消');
      }

      emit('fetching_media', '拉取本机媒体库视频与封面');
      const videoPath = join(workDir, 'video.mp4');
      const coverPath = join(workDir, 'cover.jpg');
      await downloadToFile(payload.mediaUrl, videoPath);
      await downloadToFile(payload.coverUrl, coverPath);
      const coverLandscapePath = join(workDir, 'cover-landscape.jpg');
      await downloadToFile(payload.coverLandscapeUrl, coverLandscapePath);

      if (signal.cancelled) {
        return fail(base, 'cancelled', '已取消');
      }

      emit('opening_creator', '打开创作者中心（临时会话）');
      partition = `temp:publish-${payload.requestId}`;
      const publishSession = session.fromPartition(partition, { cache: false });
      await injectCookies(publishSession, payload.cookies as AgentCookie[]);

      win = new BrowserWindow({
        width: 1280,
        height: 860,
        show: true,
        title: '蒲公英 · 抖音发布',
        webPreferences: {
          session: publishSession,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      await win.loadURL(UPLOAD_URL);
      await sleep(1800);

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

      emit('uploading', '注入视频到上传控件');
      const attached = await tryAttachVideoFile(win, videoPath);
      if (!attached) {
        keepWindowForManual = true;
        return fail(
          base,
          'ADAPTER_UI_CHANGED',
          '未能定位抖音上传控件（创作者页改版时需更新适配器）。窗口已保留，可手动选文件。',
        );
      }

      emit('uploading', '等待进入作品编辑页');
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
          '视频已挂载，但未在时限内进入编辑页；请在打开的窗口继续完成发布。',
        );
      }

      emit('submitting', '填写标题与简介');
      await fillPostMeta(win.webContents, {
        title: payload.title,
        body: payload.body ?? '',
      });

      if (payload.scheduledAt) {
        emit('submitting', `尝试设置平台定时 ${payload.scheduledAt}`);
        await tryEnableSchedule(win.webContents, payload.scheduledAt);
      }

      // 竖/横封面：抖音创作者中心可能有多个图片 input，依次尝试挂载
      await tryAttachCoverFile(win, coverPath);
      await tryAttachCoverFile(win, coverLandscapePath);

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
      if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
        return fail(
          base,
          'MEDIA_UNREACHABLE',
          '无法拉取本机媒体库资源，请检查 MEDIA_PUBLIC_BASE_URL 是否对本机可达',
        );
      }
      if (signal.cancelled || message === 'cancelled') {
        return fail(base, 'cancelled', '已取消');
      }
      return fail(base, 'PUBLISH_FAILED', message);
    } finally {
      if (keepWindowForManual && win && !win.isDestroyed()) {
        // 立即回传结果给前端；窗口后台保留供人工收尾，超时后销毁。
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
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch {
        // ignore — files may still be referenced by open window briefly
      }
    }
  })();
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

async function downloadToFile(url: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = net.request(url);
    request.on('response', (response) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        reject(new Error(`download_failed:${status}`));
        response.on('data', () => undefined);
        response.on('end', () => undefined);
        return;
      }
      const file = createWriteStream(dest);
      response.on('data', (chunk) => {
        file.write(chunk);
      });
      response.on('end', () => {
        file.end(() => {
          resolve();
        });
      });
      response.on('error', (err) => {
        file.destroy();
        reject(err);
      });
      file.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

async function tryAttachVideoFile(
  win: BrowserWindow,
  videoPath: string,
): Promise<boolean> {
  return setFileOnFirstMatchingInput(win, videoPath, [
    'input[type="file"][accept*="video"]',
    'input[type="file"][accept*="mp4"]',
    'input[type="file"]',
  ]);
}

async function tryAttachCoverFile(
  win: BrowserWindow,
  coverPath: string,
): Promise<boolean> {
  return setFileOnFirstMatchingInput(win, coverPath, [
    'input[type="file"][accept*="image"]',
    'input[type="file"][accept*="jpeg"]',
    'input[type="file"][accept*="png"]',
  ]);
}

async function setFileOnFirstMatchingInput(
  win: BrowserWindow,
  filePath: string,
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
        files: [filePath],
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
        /作品描述|标题|添加作品描述/.test(text);
      const hasPublish = /发布|定时发布/.test(text);
      return hasTitle && hasPublish;
    })()`);
  } catch {
    return false;
  }
}

async function fillPostMeta(
  wc: WebContents,
  meta: { title: string; body: string },
): Promise<void> {
  const title = meta.title.slice(0, 30);
  const body = meta.body.slice(0, 1000);
  await wc.executeJavaScript(`(() => {
    const titleText = ${JSON.stringify(title)};
    const bodyText = ${JSON.stringify(body)};

    const setNativeValue = (el, value) => {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    if (editables[0] && titleText) {
      editables[0].focus();
      editables[0].textContent = titleText;
      editables[0].dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    if (editables[1] && bodyText) {
      editables[1].focus();
      editables[1].textContent = bodyText;
      editables[1].dispatchEvent(new InputEvent('input', { bubbles: true }));
    }

    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    for (const el of inputs) {
      const ph = (el.getAttribute('placeholder') || '') + (el.getAttribute('aria-label') || '');
      if (/标题|作品标题|填写作品标题/.test(ph) && titleText) {
        setNativeValue(el, titleText);
      }
      if (/描述|简介|作品描述|添加作品描述/.test(ph) && bodyText) {
        setNativeValue(el, bodyText);
      }
    }
    return true;
  })()`);
}

async function tryEnableSchedule(
  wc: WebContents,
  scheduledAtIso: string,
): Promise<boolean> {
  try {
    return await wc.executeJavaScript(`(() => {
      const iso = ${JSON.stringify(scheduledAtIso)};
      const nodes = Array.from(document.querySelectorAll('button, label, span, div'));
      const toggle = nodes.find((n) => /定时发布/.test((n.textContent || '').trim()));
      if (toggle) {
        toggle.click();
      }
      // Best-effort: fill any datetime-looking inputs
      const inputs = Array.from(document.querySelectorAll('input'));
      for (const el of inputs) {
        const t = (el.type || '') + (el.placeholder || '');
        if (/date|time|定时/.test(t) || el.type === 'datetime-local') {
          try {
            el.value = iso.slice(0, 16);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (_) {}
        }
      }
      return !!toggle;
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
      // Prefer exact 「发布」 over longer labels like 「保存草稿」
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
          /\\/content\\/manage|\\/content\\/works|\\/video\\//.test(url);
        const authLost = /登录|重新登录|扫码/.test(text) && /失效|过期|重新/.test(text);
        return { url, ok, authLost, textSnippet: text.slice(0, 200) };
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
