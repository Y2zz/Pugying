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

console.log("依赖均使用精确版本。");
