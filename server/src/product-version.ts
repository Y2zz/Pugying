import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ProductVersionInfo {
  /** 统一发版产品版本（与 server/package.json 一致，可由环境变量覆盖） */
  version: string;
  /** 兼容的最低桌面 Agent 版本；统一发版时默认与产品版本相同 */
  minAgentVersion: string;
}

let cached: ProductVersionInfo | null = null;

/** 从发版包 package.json 读取产品版本；部署时可用 PUGYING_* 环境变量覆盖 */
export function getProductVersionInfo(): ProductVersionInfo {
  if (cached) {
    return cached;
  }
  // nest 编译产物在 dist/src，进程 cwd 为 backend 根目录
  const pkgPath = join(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  const version = process.env.PUGYING_PRODUCT_VERSION ?? pkg.version;
  const minAgentVersion = process.env.PUGYING_MIN_AGENT_VERSION ?? version;
  cached = { version, minAgentVersion };
  return cached;
}
