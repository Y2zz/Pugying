#!/usr/bin/env bash
# 停止本机部署的 Pugying 进程
set -euo pipefail

for app in pugying-backend pugying-frontend; do
  pm2 delete "$app" 2>/dev/null || true
done
pm2 save --force >/dev/null 2>&1 || true

echo "已停止 pugying-backend / pugying-frontend"
