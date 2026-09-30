#!/usr/bin/env bash
# ============================================================
#  群档案客户端 · 构建（Linux / macOS / Git Bash）
#  1) javac → out/classes   2) jar → out/GroupBlackNet-Client.jar
#  3) 若找到 Launch4j，再生成 out/GroupBlackNet.exe
# ============================================================
set -e
cd "$(dirname "$0")"

if ! command -v javac >/dev/null 2>&1; then
  echo "[错误] 未找到 javac，请安装 JDK 21 并把 bin 加入 PATH。"
  exit 1
fi

rm -rf out/classes
mkdir -p out/classes
find src/main/java -name '*.java' > out/sources.txt
javac -encoding UTF-8 -d out/classes @out/sources.txt

if [ -d src/main/resources ]; then
  cp -r src/main/resources/. out/classes/
fi

rm -f out/GroupBlackNet-Client.jar
jar --create --file out/GroupBlackNet-Client.jar     --main-class com.groupblacknet.client.App -C out/classes .
echo "[完成] 可执行包：out/GroupBlackNet-Client.jar"

# ---- 可选：Launch4j ----
L4J=""
if [ -f launcher/launch4j.path ]; then
  L4J=$(head -n 1 launcher/launch4j.path | tr -d '' | sed 's/[[:space:]]*$//')
fi
[ -z "$L4J" ] && [ -n "${LAUNCH4J_HOME:-}" ] && L4J="$LAUNCH4J_HOME"
[ -z "$L4J" ] && command -v launch4jc >/dev/null 2>&1 && L4J=$(dirname "$(command -v launch4jc)")

L4JC=""
[ -n "$L4J" ] && [ -x "$L4J/launch4jc.exe" ] && L4JC="$L4J/launch4jc.exe"
[ -z "$L4JC" ] && [ -n "$L4J" ] && [ -x "$L4J/launch4j" ] && L4JC="$L4J/launch4j"
[ -z "$L4JC" ] && command -v launch4j >/dev/null 2>&1 && L4JC=$(command -v launch4j)

if [ -n "$L4JC" ]; then
  echo "[信息] 使用 Launch4j：$L4JC"
  "$L4JC" launcher/launch4j-config.xml && echo "[完成] 启动器：out/GroupBlackNet.exe"     || echo "[警告] Launch4j 生成 exe 失败（jar 已可用）"
else
  echo "[跳过] 未找到 Launch4j，只生成 jar。"
  echo "        设置 LAUNCH4J_HOME 或写入 launcher/launch4j.path 即可生成 exe。"
fi

echo "[完成] 编译输出：out/classes"
