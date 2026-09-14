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

function run(cmd, args, cwd) {
  // Windows 上 npm/npx 实为 .cmd；shell:false 会 ENOENT，status 为 null
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with ${result.status}`);
  }
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
  const prebuild = spawnSync(
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
    { cwd: moduleRoot, stdio: 'inherit', shell: false },
  );
  if (prebuild.status === 0) {
    return;
  }

  throw new Error(
    [
      `无法为 ${target.platform}/${target.arch} 获取 better-sqlite3（Electron ${electronVersion}）预编译包，且本机（${process.platform}/${process.arch}）不能交叉编译。`,
      'Linux 请用：npm run docker:dist:linux（容器内同平台编译）。',
      'Windows 请在 Windows 主机执行 npm run dist:win，或等待/自建对应 Electron ABI 的 prebuild。',
      '参考：https://www.electron.build/multi-platform-build#build-for-windows-on-linux',
    ].join('\n'),
  );
}

function packServerDist(target) {
  console.log('[pack-server] building server…');
  run('npm', ['run', 'build'], serverRoot);
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

  console.log('[pack-server] npm ci --omit=dev in resources/server…');
  // typeorm@1.1 peerOptional 仍声明 better-sqlite3@^12，与 13.x 冲突；打包安装需放宽 peer
  run('npm', ['ci', '--omit=dev', '--legacy-peer-deps'], serverOut);
  rebuildBetterSqlite3(target);

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
