# 发版与 GitHub Actions

日常提交与 Pull Request **不触发** CI。仅在发布版本（推送 `v*` 标签）或手动运行工作流时执行检查、多平台打包，并在标签发版时自动创建 GitHub Release。

## 发版流程

产品版本以 `desktop/package.json` 与 `server/package.json` 的 `version` 为准（须保持一致）。`@pugying/*` 业务模块包可单独演进，不必与产品版本同步。

1. **改版本号**  
   将 `desktop/package.json`、`server/package.json` 的 `version` 改为目标版本（如 `0.1.0`）。无需改 lockfile（version 字段不锁依赖树）。

2. **提交**  
   ```bash
   git add desktop/package.json server/package.json
   git commit -m "chore: release v0.1.0"
   git push origin main
   ```

3. **打标签并推送**（触发发版）  
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```  
   标签必须为 `v` + 与 package.json 相同的 semver（支持预发布后缀，如 `v0.1.0-beta.1`）。

4. **等待 Release 工作流**  
   Actions 会：校验 tag 与两个 package.json 版本一致 → 跑 Server/Desktop 检查 → 四平台打包 → 创建同名 GitHub Release，并挂上安装包。

5. **核对发布页**  
   打开仓库 Releases，确认标题为「蒲公英 vX.Y.Z」，附件含各平台安装文件。

本地可先校验版本对齐：

```bash
node scripts/verify-release-version.mjs v0.1.0
```

## 工作流行为

| 触发 | 检查 + 打包 | GitHub Release |
| ---- | ----------- | -------------- |
| 推送 `v*` 标签 | 是 | 是（自动挂载安装包） |
| `workflow_dispatch` 手动运行 | 是 | 否（仅 Artifacts，保留 14 天） |
| push `main` / Pull Request | 否 | 否 |

Server 与 Desktop 在 Ubuntu 24.04 上并行验证，固定使用 Node.js 24.21.0 和 npm 12.2.0。

- Server：依赖检查、`npm ci`、ESLint、单元测试、E2E 测试及构建。
- Desktop：依赖检查、`npm ci`、类型检查、Vitest 及构建。

E2E 当前没有测试用例，命令允许空测试集。

| 平台        | Runner              | 产物            |
| ----------- | ------------------- | --------------- |
| Linux x64   | Ubuntu 24.04        | DEB、RPM 安装包 |
| Windows x64 | Windows Server 2022 | NSIS EXE 安装器 |
| macOS x64   | macOS 15 Intel      | DMG 安装镜像    |
| macOS arm64 | macOS 15            | DMG 安装镜像    |

每个平台使用本机 runner 编译原生 SQLite 模块，避免跨平台编译问题。仅上传安装文件（不打包应用目录）。安装包文件名形如 `pugying-${version}-${os}-${arch}.${ext}`。

Windows 使用当前用户的一键安装器，卸载时保留本机数据，尚未配置代码签名。macOS 沿用项目的 ad-hoc 签名，未进行 Apple 公证。Linux 提供 DEB 和 RPM，分别用于 Debian/Ubuntu 与 Fedora/RHEL 等发行版。

本地 `npm run package` 生成 macOS DMG；`npm run package:win` 生成 EXE；`npm run package:linux` 生成 DEB 和 RPM。`npm run package:dir` 仍可用于本地调试，CI 不上传目录包。

## 依赖与权限

依赖声明必须使用精确版本；更新时同时提交 `package.json` 和 `package-lock.json`，并同步业务模块的 peerDependencies。可在项目根目录运行 `node scripts/check-dependency-versions.mjs` 检查。

锁文件使用公共 npm 下载地址，保留原版本和完整性校验值，避免 GitHub 托管 runner 访问内网仓库。工作流按锁文件缓存 npm，使用 `npm ci` 安装，并跳过检查任务不需要的 Electron 二进制下载。

默认工作流权限为仓库读取；创建 Release 的 job 单独申请 `contents: write`，使用内置 `GITHUB_TOKEN`，无需额外 Secret。Action 固定为提交 SHA，Node.js 与 npm 固定精确版本；升级时需同步这些固定值并验证构建。
