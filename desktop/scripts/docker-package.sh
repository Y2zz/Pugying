#!/usr/bin/env bash
# 用 electronuserland/builder 镜像打 Linux / Windows 安装包。
# 用法：
#   ./scripts/docker-package.sh linux
#   ./scripts/docker-package.sh win
#   ./scripts/docker-package.sh all
#
# Windows：官方说明「无 prebuild 的原生依赖无法在 Docker/Wine 下交叉编译」。
# 本仓库 better-sqlite3 需匹配 Electron ABI；无 win32 预编译包时 win 目标会失败。
set -euo pipefail

TARGET="${1:-}"
if [[ -z "${TARGET}" ]]; then
  echo "用法: $0 linux|win|all" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DESKTOP_ROOT}/.." && pwd)"

# 固定 tag，避免 latest 漂移；需要时可覆盖 PUGYING_DOCKER_LINUX_IMAGE / PUGYING_DOCKER_WINE_IMAGE
LINUX_IMAGE="${PUGYING_DOCKER_LINUX_IMAGE:-electronuserland/builder:22-05.26}"
WINE_IMAGE="${PUGYING_DOCKER_WINE_IMAGE:-electronuserland/builder:22-wine-05.26}"
DOCKER_PLATFORM="${PUGYING_DOCKER_PLATFORM:-linux/amd64}"

CACHE_ELECTRON="${PUGYING_ELECTRON_CACHE:-${HOME}/.cache/electron}"
CACHE_BUILDER="${PUGYING_ELECTRON_BUILDER_CACHE:-${HOME}/.cache/electron-builder}"
mkdir -p "${CACHE_ELECTRON}" "${CACHE_BUILDER}"

run_in_image() {
  local image="$1"
  local npm_script="$2"
  echo "[docker-package] image=${image} platform=${DOCKER_PLATFORM} script=${npm_script}"
  docker run --rm \
    --platform "${DOCKER_PLATFORM}" \
    --env ELECTRON_CACHE=/root/.cache/electron \
    --env ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
    --env npm_config_fund=false \
    --env npm_config_audit=false \
    -v "${REPO_ROOT}:/project" \
    -v "${CACHE_ELECTRON}:/root/.cache/electron" \
    -v "${CACHE_BUILDER}:/root/.cache/electron-builder" \
    -w /project/desktop \
    "${image}" \
    bash -lc "npm ci --prefer-offline && npm run ${npm_script}"
}

package_linux() {
  run_in_image "${LINUX_IMAGE}" "package:linux"
  echo "[docker-package] Linux 安装包: desktop/release/*.deb 和 *.rpm"
}

package_win() {
  run_in_image "${WINE_IMAGE}" "package:win"
  echo "[docker-package] Windows 安装包: desktop/release/*.exe"
}

case "${TARGET}" in
  linux)
    package_linux
    ;;
  win|windows)
    package_win
    ;;
  all)
    package_linux
    package_win
    ;;
  *)
    echo "未知目标: ${TARGET}（期望 linux|win|all）" >&2
    exit 1
    ;;
esac
