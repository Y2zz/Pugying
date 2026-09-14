#!/usr/bin/env node
/**
 * 将 Server 生产产物打进 desktop/resources，供 electron-builder extraResources 使用。
 * Nest 由 Electron 主进程托管；不再发行第二份 Node 运行时。
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

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
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

function packServerDist() {
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
  cpSync(path.join(serverRoot, 'package-lock.json'), path.join(serverOut, 'package-lock.json'));

  console.log('[pack-server] npm ci --omit=dev in resources/server…');
  run('npm', ['ci', '--omit=dev'], serverOut);
  console.log('[pack-server] rebuilding better-sqlite3 for Electron…');
  run(
    process.execPath,
    [
      path.join(desktopRoot, 'node_modules/@electron/rebuild/lib/cli.js'),
      '--force',
      '--which-module',
      'better-sqlite3',
      '--version',
      electronVersion,
      '--arch',
      process.arch,
    ],
    serverOut,
  );

  const pkg = JSON.parse(
    readFileSync(path.join(serverOut, 'package.json'), 'utf8'),
  );
  console.log(`[pack-server] server ${pkg.version} ready at ${serverOut}`);
}

function main() {
  mkdirSync(resourcesRoot, { recursive: true });
  rmSync(nodeOut, { recursive: true, force: true });
  packServerDist();
  console.log('[pack-server] done');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
