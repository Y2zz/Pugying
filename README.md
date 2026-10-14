# 蒲公英（Pugying）

桌面应用：一次创作，将文章、图文、短视频分发到多个内容平台。

数据保存在你的电脑上；无需注册账号。

## 开发

需要 Node.js **24.21.0**、npm **12.2.0**。

```bash
./scripts/install.sh   # 安装 server / desktop 依赖
./scripts/start.sh     # 启动本机 Server + Desktop
```

也可分别进入 `server/`、`desktop/` 执行 `npm install` 与各自的开发命令。环境变量示例见 `.env.example`。

## 打包

```bash
cd desktop
npm install
npm run package          # 当前系统安装包
npm run package:dir      # 仅目录包
npm run package:linux    # Linux DEB / RPM（本机）
npm run package:win      # Windows EXE（建议在 Windows 上执行）
```

也可使用 `desktop` 下的 Docker 打包脚本打 Linux / Windows 目录包（Windows 含原生模块时可能受限）。

发版：对齐 `desktop/package.json` 与 `server/package.json` 的 `version` 后推送 `v*` 标签，由 GitHub Actions 检查、打包并创建 Release。

## 许可

见 [LICENSE](LICENSE)（GPL-3.0）。
