# Pugying 部署指南

## 总览

| 文件 | 用途 |
|------|------|
| `.gitlab-ci.yml` | CI：三模块 lint + 测试 + 编译；CD：main/tag 构建（可选推送）Docker 镜像 |
| `scripts/deploy-local.sh` | 本机部署（pm2） |
| `scripts/stop-local.sh` | 停止本机部署 |
| `ecosystem.config.cjs` | pm2 进程定义 |
| `docker-compose.yml` + `backend/Dockerfile` + `frontend/Dockerfile` | Docker 部署 |
| `.env.example` | 部署配置模板（两种方式共用） |

agent（Electron 桌面端）仅在 CI 中编译校验，不参与服务器部署。

## CI（GitLab）

推送 MR / main / tag 自动触发。check 阶段三模块并行：install → lint → 测试 → 编译，产物（backend/dist、frontend/dist）保留 1 周。docker 阶段在 main 与 tag 上验证镜像可构建；若 GitLab 启用了 Container Registry 会自动推送 `<registry>/backend|frontend:<tag>`。

Runner 要求：check 阶段任意 docker/shell executor 均可；docker 阶段需支持 dind（privileged）或 shell executor 自带 docker（后者删除 job 中 `image`/`services` 两段即可）。

## 部署配置（两种方式共用）

```bash
cp .env.example .env   # 然后编辑
```

| 变量 | 说明 | 默认 |
|------|------|------|
| `JWT_SECRET` | JWT 签名密钥，生产必填（`openssl rand -hex 32`） | 无 |
| `API_BASE_URL` | 浏览器访问后端的地址，构建期注入前端 | `http://localhost:3000` |
| `CORS_ORIGINS` | 允许跨域的前端来源，逗号分隔 | 前端本机地址 |
| `BACKEND_PORT` / `FRONTEND_PORT` | 端口 | 3000 / 8080 |

注意：`API_BASE_URL` 是前端构建期注入的，修改后需重新构建/部署前端。

## 本机部署（pm2）

```bash
npm install -g pm2          # 首次
scripts/deploy-local.sh     # 编译并启动/热重载
scripts/stop-local.sh       # 停止
```

后端数据库文件位于 `backend/pugying.db`（与开发一致），迁移随启动自动执行。开机自启：`pm2 startup` 并按提示操作。

## Docker 部署

```bash
cp .env.example .env && vim .env
docker compose up -d --build
```

前端 `http://<主机>:8080`，后端 `http://<主机>:3000`（Swagger `/api`）。数据库持久化在名为 `pugying-data` 的卷中。

更新版本：`git pull && docker compose up -d --build`
备份数据：`docker run --rm -v pugying-data:/data -v $PWD:/backup alpine cp /data/pugying.db /backup/`
