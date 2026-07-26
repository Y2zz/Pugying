#!/usr/bin/env bash
# Pugying 本机部署：编译 backend + frontend，并用 pm2 启动/重载
# 用法：scripts/deploy-local.sh   （可选：先在仓库根目录准备 .env，参考 .env.example）
set -euo pipefail
cd "$(dirname "$0")/.."

# 读取 .env（可选）
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export BACKEND_PORT="${BACKEND_PORT:-3000}"
export FRONTEND_PORT="${FRONTEND_PORT:-8080}"
API_BASE_URL="${API_BASE_URL:-http://localhost:${BACKEND_PORT}}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${FRONTEND_PORT}}"

if [ -z "${JWT_SECRET:-}" ]; then
  echo "警告：未设置 JWT_SECRET，后端将使用开发默认密钥；生产环境请在 .env 中配置。"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "缺少 pm2，请先执行：npm install -g pm2"
  exit 1
fi

echo "==> 编译 backend"
(cd backend && npm ci && npm run build)

echo "==> 编译 frontend（VITE_API_BASE_URL=${API_BASE_URL}）"
(cd frontend && npm ci && VITE_API_BASE_URL="${API_BASE_URL}" npm run build)

echo "==> pm2 启动/重载"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo ""
echo "部署完成："
echo "  前端  http://localhost:${FRONTEND_PORT}"
echo "  后端  http://localhost:${BACKEND_PORT}  （Swagger: /api）"
echo "  状态  pm2 status    日志  pm2 logs"
