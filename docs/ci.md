# GitHub Actions

`.github/workflows/ci.yml` 在推送 `main`、推送标签、提交 Pull Request 或手动运行时触发。

Server 与 Desktop 在 Ubuntu 24.04 上并行验证，固定使用 Node.js 24.21.0 和 npm 12.2.0。

- Server：依赖检查、`npm ci`、ESLint、单元测试、E2E 测试及构建。
- Desktop：依赖检查、`npm ci`、类型检查、Vitest 及构建。

E2E 当前没有测试用例，命令允许空测试集。

检查通过后，推送 `main`、推送标签或手动运行会继续打包；Pull Request 只执行检查。

| 平台        | Runner              | 产物            |
| ----------- | ------------------- | --------------- |
| Linux x64   | Ubuntu 24.04        | DEB、RPM 安装包 |
| Windows x64 | Windows Server 2022 | NSIS EXE 安装器 |
| macOS x64   | macOS 15 Intel      | DMG 安装镜像    |
| macOS arm64 | macOS 15            | DMG 安装镜像    |

每个平台使用本机 runner 编译原生 SQLite 模块，避免跨平台编译问题。仅上传安装文件，不将应用目录制作成 ZIP 或 tar.gz。产物在运行页面的 Artifacts 中下载，保留 14 天；GitHub 的 Artifacts 下载界面可能以 ZIP 容器提供这些安装文件。

Windows 使用当前用户的一键安装器，卸载时保留本机数据，尚未配置代码签名。macOS 沿用项目的 ad-hoc 签名，未进行 Apple 公证。Linux 提供 DEB 和 RPM，分别用于 Debian/Ubuntu 与 Fedora/RHEL 等发行版。

本地 `npm run package` 生成 macOS DMG；`npm run package:win` 生成 EXE；`npm run package:linux` 生成 DEB 和 RPM。`npm run package:dir` 仍可用于本地调试，CI 不上传目录包。

打包任务包含本机 Server 及生产依赖，不自动创建 GitHub Release。

依赖声明必须使用精确版本；更新时同时提交 `package.json` 和 `package-lock.json`，并同步业务模块的 peerDependencies。可在项目根目录运行 `node scripts/check-dependency-versions.mjs` 检查。

锁文件使用公共 npm 下载地址，保留原版本和完整性校验值，避免 GitHub 托管 runner 访问内网仓库。工作流按锁文件缓存 npm 下载缓存，使用 `npm ci` 安装，并跳过检查任务不需要的 Electron 二进制下载。

工作流只需仓库读取权限，无需配置额外 Secret。Action 固定为提交 SHA，Node.js 与 npm 固定精确版本；升级时需同步这些固定值并验证构建。
