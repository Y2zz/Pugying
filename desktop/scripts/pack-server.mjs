#!/usr/bin/env node
/**
 * 将 Server 生产产物打进 desktop/resources，供 electron-builder extraResources 使用。
 * Nest 由 Electron 主进程托管；不再发行第二份 Node 运行时。
 *
 * 交叉打包示例（在 macOS 上打 Windows 用 better-sqlite3）：
 *   node scripts/pack-server.mjs --platform win32 --arch x64
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const serverRoot = path.join(repoRoot, 'server');
const resourcesRoot = path.join(desktopRoot, 'resources');
const serverOut = path.join(resourcesRoot, 'server');
const nodeOut = path.join(resourcesRoot, 'node');
const electronVersion = JSON.parse(
  readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'),
).devDependencies.electron;

/** @returns {{ platform: string, arch: string }} */
function parseTarget(argv) {
  let platform = process.platform;
  let arch = process.arch;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--platform' && argv[i + 1]) {
      platform = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--arch' && argv[i + 1]) {
      arch = argv[i + 1];
      i += 1;
    }
  }
  return { platform, arch };
}

/**
 * Windows：npm/npx 为 .cmd，须带后缀并经 shell；node.exe 等带空格路径
 *（如 C:\\Program Files\\nodejs\\node.exe）绝不能 shell:true，否则会拆成 `C:\\Program`。
 */
function resolveCommand(cmd) {
  if (process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx')) {
    return `${cmd}.cmd`;
  }
  return cmd;
}

function run(cmd, args, cwd) {
  const resolved = resolveCommand(cmd);
  const useShell =
    process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved);
  const result = spawnSync(resolved, args, {
    cwd,
    stdio: 'inherit',
    shell: useShell,
  });
  if (result.error) {
    throw new Error(
      `${resolved} ${args.join(' ')} failed: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${resolved} ${args.join(' ')} failed with ${result.status}`,
    );
  }
}

function nestCliEntry() {
  return path.join(
    serverRoot,
    'node_modules',
    '@nestjs',
    'cli',
    'bin',
    'nest.js',
  );
}

/** 打包前保证 server 含 @nestjs/cli；用 node 调 nest.js，避开 Windows 找不到 nest.cmd */
function ensureServerBuilt() {
  const nestJs = nestCliEntry();
  if (!existsSync(nestJs)) {
    console.log('[pack-server] installing server dependencies…');
    run('npm', ['ci'], serverRoot);
  }
  if (!existsSync(nestJs)) {
    throw new Error(
      `缺少 ${nestJs}。请在 server/ 执行 npm ci 后再打包。`,
    );
  }
  console.log('[pack-server] building server…');
  run(process.execPath, [nestJs, 'build'], serverRoot);
}

function assertNoDebugBuildArtifacts(root) {
  const forbidden = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const entryPath = path.join(directory, entry);
      if (statSync(entryPath).isDirectory()) {
        visit(entryPath);
      } else if (entry.endsWith('.map') || entry.endsWith('.d.ts')) {
        forbidden.push(path.relative(root, entryPath));
      }
    }
  };
  visit(root);
  if (forbidden.length > 0) {
    throw new Error(
      `server dist contains non-runtime artifacts: ${forbidden.join(', ')}`,
    );
  }
}

function rebuildBetterSqlite3(target) {
  const rebuildCli = path.join(
    desktopRoot,
    'node_modules/@electron/rebuild/lib/cli.js',
  );
  const samePlatform =
    target.platform === process.platform && target.arch === process.arch;

  console.log(
    `[pack-server] rebuilding better-sqlite3 for Electron ${electronVersion} (${target.platform}/${target.arch})…`,
  );

  if (samePlatform) {
    run(
      process.execPath,
      [
        rebuildCli,
        '--force',
        '--which-module',
        'better-sqlite3',
        '--version',
        electronVersion,
        '--platform',
        target.platform,
        '--arch',
        target.arch,
      ],
      serverOut,
    );
    return;
  }

  // 交叉打包：node-gyp 不能从源码交叉编译，只能拉 Electron 预编译包
  const moduleRoot = path.join(serverOut, 'node_modules', 'better-sqlite3');
  console.log(
    '[pack-server] host≠target，尝试 prebuild-install 拉取 Electron 预编译包…',
  );
  try {
    run(
      'npx',
      [
        '--yes',
        'prebuild-install@7.1.2',
        '--runtime',
        'electron',
        '--target',
        electronVersion,
        '--platform',
        target.platform,
        '--arch',
        target.arch,
        '--force',
      ],
      moduleRoot,
    );
    return;
  } catch {
    // 下面统一抛出交叉打包失败说明
  }

  throw new Error(
    [
      `无法为 ${target.platform}/${target.arch} 获取 better-sqlite3（Electron ${electronVersion}）预编译包，且本机（${process.platform}/${process.arch}）不能交叉编译。`,
      'Linux 请用：npm run docker:package:linux（容器内同平台编译）。',
      'Windows 请在 Windows 主机执行 npm run package:win，或等待/自建对应 Electron ABI 的 prebuild。',
      '参考：https://www.electron.build/multi-platform-build#build-for-windows-on-linux',
    ].join('\n'),
  );
}

function packServerDist(target) {
  ensureServerBuilt();
  assertNoDebugBuildArtifacts(path.join(serverRoot, 'dist'));

  rmSync(serverOut, { recursive: true, force: true });
  mkdirSync(serverOut, { recursive: true });

  cpSync(path.join(serverRoot, 'dist'), path.join(serverOut, 'dist'), {
    recursive: true,
  });
  cpSync(
    path.join(serverRoot, 'package.json'),
    path.join(serverOut, 'package.json'),
  );
  cpSync(
    path.join(serverRoot, 'package-lock.json'),
    path.join(serverOut, 'package-lock.json'),
  );
  // 与 server/.npmrc 一并带入，保证 resources 内 npm ci 同样放宽 peer
  const serverNpmrc = path.join(serverRoot, '.npmrc');
  if (existsSync(serverNpmrc)) {
    cpSync(serverNpmrc, path.join(serverOut, '.npmrc'));
  }

  console.log('[pack-server] npm ci --omit=dev in resources/server…');
  // ignore-scripts：避免 install 阶段因本机无 Xcode 许可而强行 node-gyp 失败；
  // 随后优先 electron-rebuild，失败则回退 better-sqlite3 自带的 N-API prebuilds。
  run('npm', ['ci', '--omit=dev', '--ignore-scripts'], serverOut);
  try {
    rebuildBetterSqlite3(target);
  } catch (err) {
    const prebuild = path.join(
      serverOut,
      'node_modules',
      'better-sqlite3',
      'prebuilds',
      `${target.platform}-${target.arch}.node`,
    );
    if (!existsSync(prebuild)) {
      throw err;
    }
    console.warn(
      `[pack-server] electron-rebuild 失败，改用 better-sqlite3 N-API 预编译：${prebuild}`,
    );
    console.warn(String(err));
  }

  const pkg = JSON.parse(
    readFileSync(path.join(serverOut, 'package.json'), 'utf8'),
  );
  console.log(`[pack-server] server ${pkg.version} ready at ${serverOut}`);
}

function main() {
  const target = parseTarget(process.argv.slice(2));
  mkdirSync(resourcesRoot, { recursive: true });
  rmSync(nodeOut, { recursive: true, force: true });
  packServerDist(target);
  console.log('[pack-server] done');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
