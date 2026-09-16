# Pugying 部署指南

蒲公英是 **个人单机桌面应用**：Desktop 内嵌本机 Server，所有内容、素材和平台账号仅存于当前操作系统用户的数据目录。

## 总览

| 文件 | 用途 |
|------|------|
| `.gitlab-ci.yml` | CI：Server / Desktop 测试与编译；可选 Docker 打 Linux 包 |
| `./start.sh` | 本地开发：Server watch + Desktop |
| `cd desktop && npm run dist` | 打出**当前主机**可运行目录包 |
| `cd desktop && npm run docker:dist:linux` | Docker 打 Linux x64 目录包 |
| `cd desktop && npm run docker:dist:win` | Docker（Wine）打 Windows x64（需 better-sqlite3 prebuild） |
| `.env.example` | 环境变量模板 |

## CI（GitLab）

推送 MR / main / tag 自动触发。check 阶段并行执行 Server 与 Desktop 的测试、类型检查和构建；另有 `desktop:dist:linux` 用官方 builder 镜像打 Linux 目录包。

## 桌面发行包

### 本机打包

```bash
cd desktop
npm ci
npm run dist   # 当前 OS 目录包 → desktop/release/
```

### Docker 打包（推荐在 macOS / 任意机打 Linux；Windows 见下）

依赖本机已安装 Docker。默认镜像：

- Linux：`electronuserland/builder:22-05.26`
- Windows：`electronuserland/builder:22-wine-05.26`（可用环境变量覆盖）

```bash
cd desktop
npm run docker:dist:linux   # → desktop/release/linux-unpacked/
npm run docker:dist:win     # → desktop/release/win-unpacked/（见原生模块限制）
# 或
./scripts/docker-dist.sh all
```

发行包由 Electron 内嵌 Node 跑 Nest；`better-sqlite3` 必须按 **Electron ABI** 为**目标平台**编译。

| 目标 | Docker | 说明 |
|------|--------|------|
| Linux x64 | ✅ | 容器内同平台 `electron-rebuild`，可用 |
| Windows x64 | ⚠️ | Wine 只能打壳；**无**对应 Electron 的 win32 prebuild 时会失败。须在 Windows 主机 `npm run dist:win`，或自建/上游提供 prebuild |

官方说明：[Build for Windows on Linux](https://www.electron.build/multi-platform-build) — *You cannot build for Windows using Docker if your app has native dependencies that don't use prebuild.*

可选环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `PUGYING_DOCKER_LINUX_IMAGE` | `electronuserland/builder:22-05.26` | Linux 构建镜像 |
| `PUGYING_DOCKER_WINE_IMAGE` | `electronuserland/builder:22-wine-05.26` | Windows（Wine）构建镜像 |
| `PUGYING_DOCKER_PLATFORM` | `linux/amd64` | `docker run --platform` |
| `PUGYING_ELECTRON_CACHE` | `~/.cache/electron` | Electron 下载缓存 |
| `PUGYING_ELECTRON_BUILDER_CACHE` | `~/.cache/electron-builder` | electron-builder 缓存 |

开发联调请用仓库根目录 `./start.sh`。发行版不会对局域网或公网提供 API 服务。

## 数据与备份

SQLite 以及设备凭据密钥默认位于系统的应用数据目录。升级个人单机版前应备份该目录；个人单机迁移会移除历史用户、角色、团队和成员关系，且不可逆。视频素材为用户本机路径引用，封面以 BLOB 存于数据库。

## 环境变量（摘要）

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 本机调试端口 | `3928` |
| `PLATFORM_CREDENTIAL_SECRET` | 平台凭据加密密钥 | 发行版由 Electron 从系统安全存储注入 |
| `PUGYING_DATABASE_PATH` | SQLite 路径 | cwd / 桌面 userData |
