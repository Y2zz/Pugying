# Pugying 部署指南

蒲公英是 **个人单机桌面应用**：Desktop 内嵌本机 Server，所有内容、素材和平台账号仅存于当前操作系统用户的数据目录。

## 总览

| 文件 | 用途 |
|------|------|
| `.gitlab-ci.yml` | CI：Server / Desktop 测试与编译 |
| `./start.sh` | 本地开发：Server watch + Desktop |
| `cd desktop && npm run dist` | 打出本机可运行目录包（含 Server 产物 + 内置 Node） |
| `.env.example` | 环境变量模板 |

## CI（GitLab）

推送 MR / main / tag 自动触发。check 阶段并行执行 Server 与 Desktop 的测试、类型检查和构建。

## 桌面发行包（推荐）

```bash
cd desktop
npm ci
npm run dist   # electron-vite build → pack:server（含 Node）→ electron-builder --dir
```

产物在 `desktop/release/`。发行包 **自带 Node 运行时**，终端用户无需安装 Node.js。数据默认落在系统 userData（SQLite、媒体库等）。

开发联调请用仓库根目录 `./start.sh`。发行版不会对局域网或公网提供 API 服务。

## 数据与备份

SQLite、媒体文件以及设备凭据密钥默认位于系统的应用数据目录。升级个人单机版前应备份该目录；个人单机迁移会移除历史用户、角色、团队和成员关系，且不可逆。

## 环境变量（摘要）

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 本机调试端口 | `3928` |
| `PLATFORM_CREDENTIAL_SECRET` | 平台凭据加密密钥 | 发行版由 Electron 从系统安全存储注入 |
| `MEDIA_PUBLIC_BASE_URL` | 拉媒体可达基址 | 桌面注入为本机 API |
| `PUGYING_DATABASE_PATH` | SQLite 路径 | cwd / 桌面 userData |
