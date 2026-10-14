import { readFileSync } from 'fs';
import path from 'path';
import { app, session, type Session } from 'electron';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Electron 写入 UA 的「应用名」可能是 getName()、package.json name，
 * 或打包后的 productName（如「蒲公英」）；版本以 getVersion() 为准。
 */
export function resolveAppUaIdentities(): {
  names: string[];
  version: string;
} {
  const version = app.getVersion().trim();
  const names = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      names.add(value.trim());
    }
  };
  push(app.getName());
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      name?: string;
      productName?: string;
      build?: { productName?: string };
    };
    push(pkg.name);
    push(pkg.productName);
    push(pkg.build?.productName);
  } catch {
    // 读不到 package.json 时仍用 getName()/getVersion()
  }
  return { names: [...names], version };
}

/**
 * 平台创作者站（尤其微信视频号）会识别 Electron 默认 UA 里的
 * `Electron/…` 以及「应用名/版本」段，扫码后拒登并跳回登录页。
 *
 * 名称与版本均运行时解析，不写死；发版改名/改版本后仍能对上 UA 片段。
 */
export function toChromeLikeUserAgent(
  rawUserAgent: string,
  appNames: string[],
  appVersion: string,
): string {
  let result = rawUserAgent;

  // 去掉 Electron/任意版本（随 Electron 升级变化）
  result = result.replace(/\sElectron\/\S+/gi, '');

  const version = appVersion.trim();
  if (version) {
    for (const rawName of appNames) {
      const name = rawName.trim();
      if (!name) {
        continue;
      }
      const token = new RegExp(
        `\\s${escapeRegExp(name)}/${escapeRegExp(version)}`,
        'g',
      );
      result = result.replace(token, '');
    }
  }

  return result.replace(/\s{2,}/g, ' ').trim();
}

/** 每个 Session 只挂一次请求头兜底，避免重复 onBeforeSendHeaders */
const sessionsWithHeaderOverride = new WeakSet<Session>();

/**
 * iframe 子帧不会继承 session.setUserAgent（Electron #40374），
 * 用 onBeforeSendHeaders 强制覆盖该 Session 上所有请求。
 * 视频号登录二维码常嵌在 iframe 内，必须盖到子帧请求。
 */
function ensureSessionUserAgent(targetSession: Session, userAgent: string): void {
  // 第二参：平台页偏好中文；与 UA 一并写入 session
  targetSession.setUserAgent(userAgent, 'zh-CN,zh');
  if (sessionsWithHeaderOverride.has(targetSession)) {
    return;
  }
  sessionsWithHeaderOverride.add(targetSession);
  targetSession.webRequest.onBeforeSendHeaders(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          'User-Agent': userAgent,
        },
      });
    },
  );
}

/**
 * 进程级安装：所有窗口 / 分区 / 后续创建的 WebContents 都不带 Electron /
 * 应用名版本标识。须在创建任何 BrowserWindow 之前调用。
 */
export function installChromeLikeUserAgent(): string {
  const { names, version } = resolveAppUaIdentities();
  const userAgent = toChromeLikeUserAgent(
    app.userAgentFallback || session.defaultSession.getUserAgent(),
    names,
    version,
  );
  app.userAgentFallback = userAgent;
  ensureSessionUserAgent(session.defaultSession, userAgent);

  // 覆盖后续分区会话与顶层 frame（含授权 / 发布 / 创作者中心）
  app.on('web-contents-created', (_event, contents) => {
    contents.setUserAgent(userAgent);
    ensureSessionUserAgent(contents.session, userAgent);
  });

  return userAgent;
}
