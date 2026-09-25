/**
 * 跨平台启动 electron-vite，并清除 ELECTRON_RUN_AS_NODE。
 * Cursor / 部分宿主会注入该变量，导致 Electron 以 Node 模式运行、无法起窗口。
 * Unix 可用 `env -u`；Windows cmd 无此命令，故用本脚本统一处理。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

delete process.env.ELECTRON_RUN_AS_NODE;

const require = createRequire(import.meta.url);
const pkgRoot = path.dirname(require.resolve('electron-vite/package.json'));
const cli = path.join(pkgRoot, 'bin', 'electron-vite.js');

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
