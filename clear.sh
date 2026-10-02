#!/usr/bin/env bash
# 清理项目依赖、构建产物和测试缓存；可从任意目录调用。
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=0

usage() {
  cat <<'EOF'
用法: ./clear.sh [--dry-run]

选项:
  --dry-run    仅列出待清理路径，不删除
  -h, --help   显示帮助

清理 node_modules、dist、out、release、coverage、.nyc_output、
.vite、.cache、test-reports、TypeScript 增量缓存，以及 desktop/resources
中的打包产物 server 和 node。
保留源码、desktop/build 打包配置、数据库、环境配置和依赖锁文件。
EOF
}

for argument in "$@"; do
  case "$argument" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf '未知参数: %s\n' "$argument" >&2; usage >&2; exit 1 ;;
  esac
done

cd "$PROJECT_ROOT"

# find 默认不跟随符号链接；prune 避免遍历依赖和构建目录内部。
# 先完整收集路径，再删除，避免影响 find 的遍历。
TARGET_LIST="$(mktemp)"
trap 'rm -f -- "$TARGET_LIST"' EXIT
find . \
  -type d -name .git -prune -o \
  \( \( -type d -o -type l \) \
    \( -name node_modules -o -name dist -o -name out -o -name release \
      -o -name coverage -o -name .nyc_output -o -name .vite -o -name .cache \
      -o -name test-reports -o -path './desktop/resources/server' \
      -o -path './desktop/resources/node' \) \) -prune -print0 -o \
  -type f -name '*.tsbuildinfo' -print0 > "$TARGET_LIST"

COUNT=0
while IFS= read -r -d '' target; do
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '待清理: %s\n' "$target"
  else
    printf '清理: %s\n' "$target"
    rm -rf -- "$target"
  fi
  COUNT=$((COUNT + 1))
done < "$TARGET_LIST"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '共 %s 项，未删除任何文件。\n' "$COUNT"
else
  printf '清理完成，共 %s 项。\n' "$COUNT"
fi
