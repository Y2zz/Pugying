# GitHub Actions

`.github/workflows/ci.yml` 在推送 `main`、推送标签、提交 Pull Request 或手动运行时触发。

Server 与 Desktop 在 Ubuntu 24.04 上并行验证，固定使用 Node.js 24.21.0 和 npm 12.2.0。

- Server：依赖检查、`npm ci`、ESLint、单元测试、E2E 测试及构建。
- Desktop：依赖检查、`npm ci`、类型检查、Vitest 及构建。

E2E 当前没有测试用例，命令允许空测试集。工作流验证编译产物，不打桌面发行包。

依赖声明必须使用精确版本；更新时同时提交 `package.json` 和 `package-lock.json`，并同步业务模块的 peerDependencies。可在项目根目录运行 `node scripts/check-dependency-versions.mjs` 检查。

锁文件使用公共 npm 下载地址，保留原版本和完整性校验值，避免 GitHub 托管 runner 访问内网仓库。工作流按锁文件缓存 npm 下载缓存，使用 `npm ci` 安装，并跳过检查任务不需要的 Electron 二进制下载。

工作流只需仓库读取权限，无需配置额外 Secret。Action 固定为提交 SHA，Node.js 与 npm 固定精确版本；升级时需同步这些固定值并验证构建。
