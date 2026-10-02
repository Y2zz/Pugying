#!/usr/bin/env bash
# Pugying 一键安装依赖；可从任意目录调用。
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_COMMAND=install

usage() {
  cat <<'EOF'
Pugying 一键安装依赖

用法: ./install.sh [--ci]

选项:
  --ci         使用 npm ci，按锁文件安装并重建 node_modules
  -h, --help   显示帮助

默认依次在 server、desktop 中执行 npm install。
请使用当前用户运行，不要添加 sudo。
EOF
}

for argument in "$@"; do
  case "$argument" in
    --ci) INSTALL_COMMAND=ci ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数: %s\n' "$argument" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ "$EUID" -eq 0 ]]; then
  printf '请使用普通用户运行 ./install.sh，不要添加 sudo。\n' >&2
  exit 1
fi

for executable in node npm; do
  if ! command -v "$executable" > /dev/null 2>&1; then
    printf '未找到 %s，请先安装 Node.js 和 npm。\n' "$executable" >&2
    exit 1
  fi
done

for project in server desktop; do
  printf '\n正在安装 %s 依赖…\n' "$project"
  (
    cd "$PROJECT_ROOT/$project"
    npm "$INSTALL_COMMAND"
  )
done

printf '\n依赖安装完成，运行 ./start.sh 启动开发环境。\n'
