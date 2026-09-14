/**
 * 本机 Nest Server：由 Electron 主进程托管、探活和关闭。
 *
 * 发行版不再携带第二份 Node。better-sqlite3 在打包阶段按 Electron ABI 重建，
 * Nest 因而可以直接使用 Electron 自带的 Node 运行时。
 */
import { app, safeStorage } from 'electron';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** 默认本机 API 端口（避开历史 WS 3927） */
export const DEFAULT_SERVER_PORT = 3928;

interface LocalServerApplication {
  close(): Promise<void>;
}

interface LocalServerRuntimeOptions {
  host: string;
  port: number;
  databasePath: string;
  mediaStorageDir: string;
  mediaPublicBaseUrl: string;
  credentialSecret: string;
  mediaSigningSecret: string;
  localApiToken: string;
}

interface LocalServerBootstrap {
  startLocalApiServer(
    options: LocalServerRuntimeOptions,
  ): Promise<LocalServerApplication>;
}

let localServer: LocalServerApplication | null = null;
let apiBaseUrl = `http://127.0.0.1:${DEFAULT_SERVER_PORT}`;
let localApiToken = '';

/**
 * 平台凭据的设备密钥由操作系统凭据库加密后持久化。
 * 它与已移除的 JWT / 应用用户密码完全无关。
 */
function getDeviceCredentialSecret(): string {
  const keyPath = path.join(app.getPath('userData'), 'credential-key.bin');
  try {
    if (fs.existsSync(keyPath)) {
      const encrypted = fs.readFileSync(keyPath);
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encrypted);
      }
      return encrypted.toString('utf8');
    }
  } catch (error) {
    throw new Error(`无法读取本机凭据密钥：${String(error)}`);
  }

  const secret = randomBytes(32).toString('base64url');
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(secret)
    : Buffer.from(secret, 'utf8');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, payload, { mode: 0o600 });
  return secret;
}

/**
 * 个人单机迁移会删除历史身份与团队表；首次启动前保留一次可人工恢复的完整快照。
 * 标记只在快照成功后写入，避免失败时跳过下一次保护。
 */
function backupLegacyDataIfNeeded(dataDir: string): void {
  const markerPath = path.join(dataDir, 'personal-single-machine-backup-v1');
  const dbPath = path.join(dataDir, 'pugying.db');
  if (fs.existsSync(markerPath) || !fs.existsSync(dbPath)) {
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(dataDir, 'backups', `before-personal-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(dbPath, path.join(backupDir, 'pugying.db'));
  const mediaDir = path.join(dataDir, 'media');
  if (fs.existsSync(mediaDir)) {
    fs.cpSync(mediaDir, path.join(backupDir, 'media'), { recursive: true });
  }
  fs.writeFileSync(markerPath, `${backupDir}\n`, { mode: 0o600 });
  console.log(`[pugying-desktop] backed up legacy data to ${backupDir}`);
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function getLocalApiToken(): string {
  return localApiToken;
}

function resourcesRoot(): string {
  // 打包后：.../蒲公英.app/Contents/Resources
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  // 开发：desktop/resources（可由 pack:server 生成；缺省回退到仓库 server/）
  return path.join(app.getAppPath(), 'resources');
}

function resolveServerEntry(): { entry: string } {
  const packagedServer = path.join(resourcesRoot(), 'server');
  if (app.isPackaged || fs.existsSync(path.join(packagedServer, 'dist', 'src', 'main.js'))) {
    return {
      entry: path.join(packagedServer, 'dist', 'src', 'main.js'),
    };
  }
  // 开发：直接指向仓库 server/（需先 npm run build 或 start:dev 产物）
  const repoServer = path.resolve(app.getAppPath(), '..', 'server');
  const distEntry = path.join(repoServer, 'dist', 'src', 'main.js');
  if (fs.existsSync(distEntry)) {
    return { entry: distEntry };
  }
  // 开发无 dist 时用 nest CLI watch 路径提示
  return { entry: distEntry };
}

function applyServerRuntimeEnvironment(
  options: LocalServerRuntimeOptions,
): void {
  process.env.PORT = String(options.port);
  process.env.HOST = options.host;
  process.env.PUGYING_DATABASE_PATH = options.databasePath;
  process.env.MEDIA_STORAGE_DIR = options.mediaStorageDir;
  process.env.MEDIA_PUBLIC_BASE_URL = options.mediaPublicBaseUrl;
  process.env.PLATFORM_CREDENTIAL_SECRET = options.credentialSecret;
  process.env.MEDIA_SIGNING_SECRET = options.mediaSigningSecret;
  process.env.PUGYING_LOCAL_API_TOKEN = options.localApiToken;
}

function loadServerBootstrap(
  entry: string,
  options: LocalServerRuntimeOptions,
): LocalServerBootstrap {
  // AppModule 的动态 TypeORM 配置在模块载入时读取环境变量，必须先设置。
  applyServerRuntimeEnvironment(options);
  const serverRequire = createRequire(entry);
  return serverRequire(path.join(path.dirname(entry), 'bootstrap.js')) as LocalServerBootstrap;
}

function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', () => {
      const fallback = createServer();
      fallback.unref();
      fallback.listen(0, '127.0.0.1', () => {
        const address = fallback.address();
        fallback.close(() => {
          if (address && typeof address === 'object') {
            resolve(address.port);
            return;
          }
          reject(new Error('unable to allocate port'));
        });
      });
    });
    server.listen(preferred, '127.0.0.1', () => {
      server.close(() => {
        resolve(preferred);
      });
    });
  });
}

async function waitForHealth(baseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api-json`, {
        signal: AbortSignal.timeout(2000),
      });
      // Swagger JSON 或任意 2xx/404 都说明 HTTP 已起来（部分部署可能关掉 swagger）
      if (response.ok || response.status === 404) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`本机 Server 启动超时：${lastError}`);
}

/**
 * 启动本机 Nest；返回 API base（http://127.0.0.1:port）。
 */
export async function startLocalServer(): Promise<string> {
  if (localServer) {
    return apiBaseUrl;
  }

  // 开发：由 start.sh / 手动起 Nest watch 时，客户端只探活、不重复拉起
  if (process.env.PUGYING_EXTERNAL_SERVER === '1') {
    const external =
      process.env.PUGYING_API_BASE_URL?.trim() ||
      `http://127.0.0.1:${DEFAULT_SERVER_PORT}`;
    apiBaseUrl = external.replace(/\/$/, '');
    localApiToken = process.env.PUGYING_LOCAL_API_TOKEN?.trim() || '';
    console.log(
      `[pugying-desktop] using external server at ${apiBaseUrl}`,
    );
    await waitForHealth(apiBaseUrl);
    return apiBaseUrl;
  }

  localApiToken = randomBytes(32).toString('base64url');
  const port = await findFreePort(DEFAULT_SERVER_PORT);
  apiBaseUrl = `http://127.0.0.1:${port}`;

  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'server');
  const mediaDir = path.join(dataDir, 'media');
  const dbPath = path.join(dataDir, 'pugying.db');
  backupLegacyDataIfNeeded(dataDir);
  fs.mkdirSync(mediaDir, { recursive: true });
  const credentialSecret = getDeviceCredentialSecret();

  const { entry } = resolveServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `找不到 Server 入口：${entry}。开发请先在 server/ 执行 npm run build。`,
    );
  }

  const options: LocalServerRuntimeOptions = {
    host: '127.0.0.1',
    port,
    databasePath: dbPath,
    mediaStorageDir: mediaDir,
    mediaPublicBaseUrl: apiBaseUrl,
    credentialSecret,
    mediaSigningSecret: randomBytes(32).toString('base64url'),
    localApiToken,
  };

  console.log(
    `[pugying-desktop] starting local server in Electron main: ${entry} (port ${port})`,
  );
  try {
    const bootstrap = loadServerBootstrap(entry, options);
    localServer = await bootstrap.startLocalApiServer(options);
    await waitForHealth(apiBaseUrl);
    return apiBaseUrl;
  } catch (error) {
    localServer = null;
    throw error;
  }
}

export async function stopLocalServer(): Promise<void> {
  const server = localServer;
  localServer = null;
  if (!server) {
    return;
  }
  await server.close();
}
