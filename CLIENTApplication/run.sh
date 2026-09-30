#!/usr/bin/env bash
# ============================================================
#  群档案客户端 · 运行（Linux / macOS / Git Bash）
# ============================================================
set -e
cd "$(dirname "$0")"

if [ ! -f out/GroupBlackNet-Client.jar ]; then
  echo "[提示] 尚未构建，先执行 ./build.sh …"
  ./build.sh
fi

exec java -Dfile.encoding=UTF-8 -jar out/GroupBlackNet-Client.jar "$@"
