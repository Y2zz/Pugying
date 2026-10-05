import { promises as fs } from "fs";
import { BrowserWindow, session, type WebContents } from "electron";
import { injectCookies } from "../auth-browser";
import { getPlatformAdapter } from "./adapters";
import {
  dismissDouyinVideoCoverRecommendation,
  fillDouyinVideoMetadata,
  applyDouyinVideoSettings,
  VIDEO_TITLE_SELECTOR,
  VIDEO_DESCRIPTION_SELECTOR,
  openDouyinVideoCover,
  verifyDouyinVideoCover,
} from "./douyin-video-form";
import type { AgentCookie } from "../protocol";
import type {
  PlatformPublishProgressPayload,
  PlatformPublishResultPayload,
  PlatformPublishStartPayload,
} from "../publish-protocol";

const UPLOAD_URL = "https://creator.douyin.com/creator-micro/content/upload";
/** 上传后进入编辑页的最长等待 */
const EDITOR_WAIT_MS = 90_000;
/** 点击发布后等待结果 */
const RESULT_WAIT_MS = 60_000;
/** 半自动：挂文件后留给用户的窗口保留时间 */
const MANUAL_HOLD_MS = 5 * 60_000;

type ProgressFn = (progress: PlatformPublishProgressPayload) => void;

/**
 * Douyin short-video publish (ephemeral session):
 * 1) 校验本机视频/封面临时路径
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
    phase: PlatformPublishProgressPayload["phase"],
    message?: string,
  ) => {
    if (signal.cancelled) {
      return;
    }
    onProgress({ ...base, phase, message });
  };

  return (async () => {
    emit("accepted");

    const adapter = getPlatformAdapter("douyin");
    if (!adapter) {
      return fail(base, "unsupported_platform", "未找到抖音适配器");
    }

    let partition = "";
    let win: BrowserWindow | null = null;
    let keepWindowForManual = false;

    try {
      if (signal.cancelled) {
        return fail(base, "cancelled", "已取消");
      }

      emit("fetching_media", "校验本机视频与封面文件");
      const videoPath = payload.mediaPath?.trim() ?? "";
      const coverPath = payload.coverPath?.trim() ?? "";
      const coverLandscapePath = payload.coverLandscapePath?.trim() ?? "";
      if (!videoPath) {
        return fail(base, "invalid_payload", "请先选择视频文件");
      }
      await assertReadable(videoPath);
      if (coverPath) {
        await assertReadable(coverPath);
      }
      if (coverLandscapePath) {
        await assertReadable(coverLandscapePath);
      }

      if (signal.cancelled) {
        return fail(base, "cancelled", "已取消");
      }

      emit("opening_creator", "打开创作者中心（临时会话）");
      partition = `temp:publish-${payload.requestId}`;
      const publishSession = session.fromPartition(partition, { cache: false });
      await injectCookies(publishSession, payload.cookies as AgentCookie[]);

      win = new BrowserWindow({
        width: 1280,
        height: 860,
        show: true,
        title: "蒲公英 · 抖音发布",
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
        return fail(base, "cancelled", "已取消");
      }

      const cookies = await publishSession.cookies.get({
        url: "https://creator.douyin.com/",
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
          sameSite: String(c.sameSite ?? ""),
        })),
        win.webContents.getURL(),
      );

      if (!authed) {
        return fail(base, "AUTH_EXPIRED", "抖音登录已失效，请重新授权媒体账号");
      }

      emit("uploading", "注入视频到上传控件");
      const attached = await tryAttachVideoFile(win, videoPath);
      if (!attached) {
        keepWindowForManual = true;
        return fail(
          base,
          "ADAPTER_UI_CHANGED",
          "未能定位抖音上传控件（创作者页改版时需更新适配器）。窗口已保留，可手动选文件。",
        );
      }

      emit("uploading", "等待进入作品编辑页");
      const editorReady = await waitUntil(
        () => isEditorPage(win!),
        EDITOR_WAIT_MS,
        signal,
      );
      if (!editorReady) {
        keepWindowForManual = true;
        return fail(
          base,
          "ADAPTER_PARTIAL",
          "视频已挂载，但未在时限内进入编辑页；请在打开的窗口继续完成发布。",
        );
      }

      emit("submitting", "填写标题与简介");
      if (
        !(await fillDouyinVideoMetadata(win.webContents, payload)) ||
        !(await applyDouyinVideoSettings(win.webContents, payload))
      ) {
        keepWindowForManual = true;
        return fail(
          base,
          "ADAPTER_PARTIAL",
          "发布信息未能完整填写，请在抖音窗口确认后完成发布。",
        );
      }

      for (const [aspect, path] of [
        ["landscape", coverLandscapePath],
        ["portrait", coverPath],
      ] as const) {
        if (path && !(await tryAttachCoverFile(win, path, aspect, signal))) {
          keepWindowForManual = true;
          return fail(
            base,
            "ADAPTER_PARTIAL",
            "封面未能完整设置，请在抖音窗口确认后完成发布。",
          );
        }
      }
      if (signal.cancelled) {
        return fail(base, "cancelled", "已取消");
      }

      emit("submitting", "点击发布");
      const clicked = await clickPublishButton(win.webContents);
      if (!clicked) {
        keepWindowForManual = true;
        return fail(
          base,
          "ADAPTER_PARTIAL",
          "已填写标题，但未找到「发布」按钮；请在打开的窗口手动点发布。",
        );
      }

      emit("submitting", "等待平台确认");
      const outcome = await waitForPublishOutcome(win, RESULT_WAIT_MS, signal);
      if (outcome.ok) {
        emit("done", "发布完成");
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
        outcome.errorCode ?? "ADAPTER_PARTIAL",
        outcome.error ??
          "已点击发布，但未在时限内确认成功；请在打开的窗口核对结果。",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("MEDIA_MISSING:")) {
        return fail(
          base,
          "MEDIA_MISSING",
          message.replace(/^MEDIA_MISSING:\s*/, "") ||
            "源文件不可用，请重新选择视频或封面",
        );
      }
      if (signal.cancelled || message === "cancelled") {
        return fail(base, "cancelled", "已取消");
      }
      return fail(base, "PUBLISH_FAILED", message);
    } finally {
      if (keepWindowForManual && win && !win.isDestroyed()) {
        // 立即回传结果给前端；窗口后台保留供人工收尾，超时后销毁。
        const heldWin = win;
        const heldPartition = partition;
        win = null;
        partition = "";
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
        heldWin.once("closed", () => {
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
  aspect: "portrait" | "landscape",
  signal: { cancelled: boolean },
): Promise<boolean> {
  const wc = win.webContents;
  const previous = await openDouyinVideoCover(wc, aspect);
  if (previous === null) {
    return false;
  }
  const preview =
    aspect === "portrait" ? "竖封面预览（3:4）" : "横封面预览（4:3）";
  const ready = await waitUntil(
    () =>
      wc.executeJavaScript(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return Boolean(dialog?.textContent.includes(${JSON.stringify(preview)}) && dialog.querySelector('input.semi-upload-hidden-input'));
  })()`),
    15000,
    signal,
  );
  if (
    !ready ||
    !(await setFileOnFirstMatchingInput(win, coverPath, [
      '[role="dialog"] input.semi-upload-hidden-input',
    ]))
  ) {
    return false;
  }
  const saved = await waitUntil(
    () =>
      wc.executeJavaScript(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const buttons = dialog ? Array.from(dialog.querySelectorAll('button')).filter((button) => button.textContent.trim() === '完成') : [];
    if (buttons.length !== 1 || buttons[0].disabled) { return false; }
    buttons[0].click();
    return true;
  })()`),
    30000,
    signal,
  );
  return (
    saved &&
    waitUntil(
      async () => {
        await dismissDouyinVideoCoverRecommendation(wc);
        return verifyDouyinVideoCover(wc, aspect, previous);
      },
      30000,
      signal,
    )
  );
}

async function setFileOnFirstMatchingInput(
  win: BrowserWindow,
  filePath: string,
  selectors: string[],
): Promise<boolean> {
  try {
    const wc = win.webContents;
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach("1.3");
    }
    const { root } = (await wc.debugger.sendCommand("DOM.getDocument", {
      depth: -1,
      pierce: true,
    })) as { root: { nodeId: number } };

    for (const selector of selectors) {
      const { nodeId } = (await wc.debugger.sendCommand("DOM.querySelector", {
        nodeId: root.nodeId,
        selector,
      })) as { nodeId: number };
      if (!nodeId) {
        continue;
      }
      await wc.debugger.sendCommand("DOM.setFileInputFiles", {
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
  return win.webContents
    .executeJavaScript(
      `(() => {
    return document.querySelectorAll(${JSON.stringify(VIDEO_TITLE_SELECTOR)}).length === 1 &&
      document.querySelectorAll(${JSON.stringify(VIDEO_DESCRIPTION_SELECTOR)}).length === 1;
  })()`,
    )
    .catch(() => false);
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
      return { ok: false, errorCode: "cancelled", error: "已取消" };
    }
    if (win.isDestroyed()) {
      return {
        ok: false,
        errorCode: "ADAPTER_PARTIAL",
        error: "发布窗口已关闭，未能确认平台回执",
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
          errorCode: "AUTH_EXPIRED",
          error: "发布过程中登录失效",
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
    errorCode: "ADAPTER_PARTIAL",
    error: "等待发布结果超时",
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
