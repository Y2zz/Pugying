#!/usr/bin/env bash
# Pugying 本地开发一键启动（本机 Server + Desktop）
# 用法：
#   ./scripts/start.sh              # 启动 server (watch) + desktop (electron-vite)
#   ./scripts/start.sh --help
set -euo pipefail

# 脚本位于 scripts/，仓库根目录为其上一级
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 启动前已在环境中的变量名（空格分隔）；文件加载不得覆盖它们
_ENV_PRESET=" $(env | sed -n 's/=.*//p' | tr '\n' ' ') "

# 从 KEY=VALUE 文件注入；已在启动环境中的键跳过，后加载的文件可覆盖先前文件。
# 顺序：.env → .env.local（本机覆盖模板）。
load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]]; then
      line="${line#*export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    case "$_ENV_PRESET" in
      *" $key "*) continue ;;
    esac
    if [[ "$val" =~ ^\"(.*)\"$ ]]; then
      val="${BASH_REMATCH[1]}"
    elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi
    export "$key=$val"
  done < "$file"
}

load_env_file "$ROOT/.env"
load_env_file "$ROOT/.env.local"

if [[ -t 1 ]]; then
  C_SERVER='\033[0;34m'
  C_DESKTOP='\033[0;35m'
  C_INFO='\033[0;36m'
  C_ERR='\033[0;31m'
  C_RESET='\033[0m'
else
  C_SERVER='' C_DESKTOP='' C_INFO='' C_ERR='' C_RESET=''
fi

usage() {
  cat <<'EOF'
Pugying 本地开发一键启动

用法:
  ./scripts/start.sh [选项]

选项:
  -h, --help        显示帮助

服务:
  server    NestJS（watch）  http://127.0.0.1:3928   Swagger: /api
  desktop   Electron         业务主窗 + 授权壳（electron-vite）

首次请安装依赖:
  (cd server && npm install)
  (cd desktop && npm install)

说明:
  开发模式下 Desktop 通过 PUGYING_EXTERNAL_SERVER=1 连接本脚本拉起的 Server，
  避免与 Electron 内再嵌入一份冲突。发行版由 Desktop 托管内嵌 Server。

  须设置 PLATFORM_CREDENTIAL_SECRET（环境变量，或仓库根目录 .env / .env.local），
  供平台 Cookie 加解密；发行版则由 Electron 从本机 credential-key.bin 注入。
  可参考 .env.example 复制为 .env.local。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
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

SERVER_PORT="${SERVER_PORT:-3928}"
# 开发态外部 Server 不会走 Electron 的 credential-key.bin，须自行提供密钥。
if [[ -z "${PLATFORM_CREDENTIAL_SECRET:-}" ]]; then
  echo "请设置 PLATFORM_CREDENTIAL_SECRET（环境变量，或在仓库根目录 .env.local 中配置，见 .env.example）" >&2
  exit 1
fi

need_install=0
if [[ ! -d server/node_modules ]]; then
  echo -e "${C_ERR}缺少 server/node_modules，请先: (cd server && npm install)${C_RESET}" >&2
  need_install=1
fi
if [[ ! -d desktop/node_modules ]]; then
  echo -e "${C_ERR}缺少 desktop/node_modules，请先: (cd desktop && npm install)${C_RESET}" >&2
  need_install=1
fi
if [[ "$need_install" -eq 1 ]]; then
  exit 1
fi

PIDS=()
cleanup() {
  echo -e "\n${C_INFO}正在停止…${C_RESET}"
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo -e "${C_INFO}启动本机 Server (PORT=${SERVER_PORT})…${C_RESET}"
(
  cd server
  export PORT="$SERVER_PORT"
  export HOST=127.0.0.1
  export PLATFORM_CREDENTIAL_SECRET
  npm run start:dev
) 2>&1 | sed -e "s/^/${C_SERVER}[server]${C_RESET} /" &
PIDS+=($!)

echo -e "${C_INFO}等待 Server 就绪…${C_RESET}"
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${SERVER_PORT}/api-json" >/dev/null 2>&1 \
    || curl -sf "http://127.0.0.1:${SERVER_PORT}/api" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo -e "${C_INFO}启动 Desktop…${C_RESET}"
(
  cd desktop
  export PUGYING_EXTERNAL_SERVER=1
  export PUGYING_API_BASE_URL="http://127.0.0.1:${SERVER_PORT}"
  npm run dev
) 2>&1 | sed -e "s/^/${C_DESKTOP}[desktop]${C_RESET} /" &
PIDS+=($!)

echo -e "${C_INFO}已启动。Ctrl+C 结束全部进程。${C_RESET}"
wait
