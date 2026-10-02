import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (file) =>
  JSON.parse(readFileSync(path.join(root, file), "utf8"));
const manifests = [
  "server/package.json",
  "desktop/package.json",
  ...readdirSync(path.join(root, "server/libs"), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(root, "server/libs", entry.name, "package.json")),
    )
    .map((entry) => `server/libs/${entry.name}/package.json`),
];

for (const file of manifests) {
  const manifest = readJson(file);
  for (const group of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [name, version] of Object.entries(manifest[group] ?? {})) {
      assert.match(
        version,
        /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/,
        `${file}: ${name} 必须使用精确版本`,
      );
    }
  }
}

for (const project of ["server", "desktop"]) {
  const manifest = readJson(`${project}/package.json`);
  const lock = readJson(`${project}/package-lock.json`);
  for (const group of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    assert.deepEqual(
      lock.packages[""][group] ?? {},
      manifest[group] ?? {},
      `${project}: 锁文件与依赖声明不一致`,
    );
    for (const [name, version] of Object.entries(manifest[group] ?? {})) {
      assert.equal(
        lock.packages[`node_modules/${name}`]?.version,
        version,
        `${project}: ${name} 的锁定版本不一致`,
      );
    }
  }
  for (const [name, dependency] of Object.entries(lock.packages)) {
    if (dependency.resolved) {
      assert.equal(
        new URL(dependency.resolved).origin,
        "https://registry.npmjs.org",
        `${project}: ${name} 必须使用公共 npm 下载地址`,
      );
    }
  }
}

console.log("依赖均使用精确版本，锁文件一致，下载地址可供公共 CI 使用。");
