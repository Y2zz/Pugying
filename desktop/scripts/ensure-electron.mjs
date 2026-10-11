/**
 * 确保 electron 二进制已下载（path.txt + dist 可执行文件）。
 * npm 12 allowScripts 按版本放行时，升级 electron 后 install 脚本常被拦住，
 * 只剩空包；electron-vite 发现无 path.txt 会直接抛 Electron uninstall。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export function ensureElectronInstalled() {
  const electronRoot = path.dirname(require.resolve('electron/package.json'));
  const pathFile = path.join(electronRoot, 'path.txt');
  const installJs = path.join(electronRoot, 'install.js');

  if (existsSync(pathFile)) {
    const relative = readFileSync(pathFile, 'utf8').trim();
    if (relative && existsSync(path.join(electronRoot, 'dist', relative))) {
      return;
    }
  }

  console.log('[pugying-desktop] Electron 二进制缺失，正在重新下载…');
  const result = spawnSync(process.execPath, [installJs], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      'Electron 二进制安装失败。请在 desktop 目录执行：node ./node_modules/electron/install.js',
    );
  }
}

// postinstall / 手工 node ./scripts/ensure-electron.mjs
const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;
if (isDirectRun) {
  try {
    ensureElectronInstalled();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
