import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 开发态从仓库根或当前工作目录加载 .env / .env.local。
 * 不覆盖进程里已有的变量（Electron 注入、shell export、start.sh 优先）。
 * 后加载的文件可覆盖先前文件中的同名键。
 */
export function loadLocalEnvFiles(): void {
  const dirs = new Set<string>([process.cwd(), resolve(process.cwd(), '..')]);
  const files: string[] = [];
  for (const dir of dirs) {
    files.push(resolve(dir, '.env'), resolve(dir, '.env.local'));
  }
  // 同名键：后出现的文件胜出（.env.local 在各目录里都排在 .env 之后；
  // 若 cwd 与父目录都有，父目录文件在后——通常 cwd=server 时父目录即仓库根）。
  // 为让「仓库根 .env.local」压过「server/.env」，按目录顺序先 cwd 再父目录即可。
  const pending = new Map<string, string>();
  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }
    for (const [key, value] of parseEnvFile(readFileSync(file, 'utf8'))) {
      pending.set(key, value);
    }
  }
  for (const [key, value] of pending) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }
    process.env[key] = value;
  }
}

function parseEnvFile(content: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const raw of content.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('export ')) {
      line = line.slice('export '.length).trim();
    }
    const eq = line.indexOf('=');
    if (eq < 1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = line.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.push([key, value]);
  }
  return out;
}
