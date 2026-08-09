#!/usr/bin/env bash
# Pugying 本地开发一键启动
# 用法：
#   ./start.sh              # 启动 backend + frontend + agent
#   ./start.sh --no-agent   # 仅 backend + frontend
#   ./start.sh --help
#
# 说明：生产/本机 pm2 部署请用 scripts/deploy-local.sh（见 DEPLOY.md）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
AGENT_WS_PORT="${AGENT_WS_PORT:-3927}"

WITH_AGENT=1

# 颜色（非 TTY 时关闭）
if [[ -t 1 ]]; then
  C_BACKEND='\033[0;34m'   # blue
  C_FRONTEND='\033[0;32m'  # green
  C_AGENT='\033[0;35m'     # magenta
  C_INFO='\033[0;36m'      # cyan
  C_WARN='\033[0;33m'      # yellow
  C_ERR='\033[0;31m'       # red
  C_RESET='\033[0m'
else
  C_BACKEND='' C_FRONTEND='' C_AGENT='' C_INFO='' C_WARN='' C_ERR='' C_RESET=''
fi

usage() {
  cat <<'EOF'
Pugying 本地开发一键启动

用法:
  ./start.sh [选项]

选项:
  --no-agent, -w    不启动 Agent（仅 backend + frontend）
  --with-agent, -a  启动 Agent（默认已启用，可显式指定）
  -h, --help        显示帮助

服务与端口:
  backend   NestJS   http://localhost:3000   （Swagger: /api）
  frontend  Vite     http://localhost:5173
  agent     Electron ws://127.0.0.1:3927

首次使用请先分别安装依赖:
  (cd backend && npm install)
  (cd frontend && npm install)
  (cd agent && npm install)

生产部署请使用: scripts/deploy-local.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-agent | -w)
      WITH_AGENT=0
      shift
      ;;
    --with-agent | -a)
      WITH_AGENT=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo -e "${C_ERR}未知参数: $1${C_RESET}" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log_info() {
  echo -e "${C_INFO}==>${C_RESET} $*"
}

log_warn() {
  echo -e "${C_WARN}警告:${C_RESET} $*"
}

log_err() {
  echo -e "${C_ERR}错误:${C_RESET} $*" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_err "未找到命令「$1」，请先安装后重试"
    exit 1
  fi
}

check_node_modules() {
  local dir="$1"
  if [[ ! -d "$ROOT/$dir/node_modules" ]]; then
    log_err "未安装依赖：$dir/node_modules"
    echo "  请先执行：cd $dir && npm install" >&2
    return 1
  fi
}

# 返回 0 表示端口空闲，1 表示被占用
port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  # 无 lsof 时用 bash /dev/tcp 探测（macOS/Linux bash 通常可用）
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

check_port_free() {
  local port="$1"
  local name="$2"
  if port_in_use "$port"; then
    log_err "端口 ${port} 已被占用（需要给 ${name}）"
    if command -v lsof >/dev/null 2>&1; then
      echo "  占用进程：" >&2
      lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sed 's/^/    /' >&2 || true
    fi
    echo "  释放端口后重试，或结束占用进程后再启动。" >&2
    return 1
  fi
}

prefix_lines() {
  local name="$1"
  local color="$2"
  # 固定宽度前缀，便于扫读
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    printf '%b[%s]%b %s\n' "$color" "$name" "$C_RESET" "$line"
  done
}

# 递归结束进程树（兼容 macOS，无需 setsid）
kill_tree() {
  local pid="$1"
  local signal="${2:-TERM}"
  local children
  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  local child
  for child in $children; do
    kill_tree "$child" "$signal"
  done
  kill -"$signal" "$pid" 2>/dev/null || true
}

PIDS=()
CLEANED=0

cleanup() {
  if [[ "$CLEANED" -eq 1 ]]; then
    return
  fi
  CLEANED=1
  trap - EXIT INT TERM

  # 尚未拉起任何子进程（例如端口检查失败）时静默退出
  if [[ ${#PIDS[@]} -eq 0 ]]; then
    return
  fi

  echo ""
  log_info "正在停止所有开发服务..."
  local pid
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid" TERM
    fi
  done

  # 给子进程一点时间优雅退出
  sleep 1
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid" KILL
    fi
  done

  wait 2>/dev/null || true
  log_info "已全部停止"
}

trap cleanup EXIT INT TERM

require_cmd node
require_cmd npm

log_info "检查依赖..."
FAILED=0
check_node_modules backend || FAILED=1
check_node_modules frontend || FAILED=1
if [[ "$WITH_AGENT" -eq 1 ]]; then
  check_node_modules agent || FAILED=1
fi
if [[ "$FAILED" -eq 1 ]]; then
  exit 1
fi

log_info "检查端口..."
check_port_free "$BACKEND_PORT" "backend" || exit 1
check_port_free "$FRONTEND_PORT" "frontend" || exit 1
if [[ "$WITH_AGENT" -eq 1 ]]; then
  check_port_free "$AGENT_WS_PORT" "agent WebSocket" || exit 1
fi

# 可选：加载仓库根目录 .env（与 deploy-local 一致）
# 注意：.env.example 面向部署（FRONTEND_PORT=8080 等），可能不适合 Vite 开发；
# 若检测到会覆盖 CORS/前端端口，给出提示。
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
  log_info "已加载 $ROOT/.env"
  if [[ -n "${CORS_ORIGINS:-}" ]] && [[ "$CORS_ORIGINS" != *"localhost:5173"* ]] && [[ "$CORS_ORIGINS" != *"127.0.0.1:5173"* ]]; then
    log_warn "CORS_ORIGINS=$CORS_ORIGINS 可能未包含 Vite 开发地址 http://localhost:5173"
  fi
fi

# 开发默认：后端监听 BACKEND_PORT；CORS 默认已覆盖 Vite
export PORT="${PORT:-$BACKEND_PORT}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${FRONTEND_PORT}}"

start_service() {
  local name="$1"
  local color="$2"
  local dir="$3"
  shift 3

  (
    cd "$ROOT/$dir"
    # 管道两侧均为子进程；cleanup 会递归结束整棵树
    "$@" 2>&1 | prefix_lines "$name" "$color"
  ) &
  PIDS+=("$!")
}

log_info "启动 backend（端口 ${BACKEND_PORT}）..."
start_service "backend " "$C_BACKEND" backend npm run start:dev

log_info "启动 frontend（端口 ${FRONTEND_PORT}）..."
start_service "frontend" "$C_FRONTEND" frontend npm run dev

if [[ "$WITH_AGENT" -eq 1 ]]; then
  log_info "启动 agent（WebSocket ${AGENT_WS_PORT}）..."
  start_service "agent   " "$C_AGENT" agent npm run dev
fi

echo ""
log_info "开发服务已启动（Ctrl+C 同时停止全部）"
echo -e "  ${C_BACKEND}backend${C_RESET}   http://localhost:${BACKEND_PORT}  （Swagger: /api）"
echo -e "  ${C_FRONTEND}frontend${C_RESET}  http://localhost:${FRONTEND_PORT}"
if [[ "$WITH_AGENT" -eq 1 ]]; then
  echo -e "  ${C_AGENT}agent${C_RESET}     ws://127.0.0.1:${AGENT_WS_PORT}"
else
  echo -e "  agent     （已跳过，需要时去掉 --no-agent）"
fi
echo ""

# 任一服务退出则结束脚本（触发 cleanup）
set +e
while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid"
      status=$?
      log_warn "有服务已退出（pid=$pid, status=$status），正在关闭其余进程..."
      exit "$status"
    fi
  done
  sleep 1
done
