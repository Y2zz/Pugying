#!/usr/bin/env node
/**
 * 发版前校验：tag（vX.Y.Z）须与 desktop/server 的 package.json version 一致，
 * 避免安装包文件名版本与 Git 标签错位。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.env.GITHUB_REF_NAME ?? process.argv[2];

if (!tag) {
  console.error('用法: verify-release-version.mjs <vX.Y.Z>（或设置 GITHUB_REF_NAME）');
  process.exit(1);
}

if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) {
  console.error(`标签格式无效: ${tag}（期望 vX.Y.Z 或 vX.Y.Z-prerelease）`);
  process.exit(1);
}

const expected = tag.slice(1);
const packages = ['desktop/package.json', 'server/package.json'];

for (const relativePath of packages) {
  const packagePath = resolve(root, relativePath);
  const { version } = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (version !== expected) {
    console.error(
      `${relativePath} 版本为 ${version}，与标签 ${tag} 不一致（期望 ${expected}）`,
    );
    process.exit(1);
  }
}

console.log(`版本校验通过: ${expected}（${packages.join(', ')}）`);
