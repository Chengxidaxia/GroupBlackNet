#!/usr/bin/env bash
# ============================================================
#  群档案客户端 · 构建（Linux / macOS / Git Bash）
#
#  产物（dist/，与 Mindustry 的分发形态一致）：
#    GroupBlackNet.exe    原生启动器（Go，读同名 json）
#    GroupBlackNet.json   配置（jrePath / classPath / mainClass / vmArgs）
#    GroupBlackNet.jar    应用本体（外置，不内嵌进 exe）
#    jre/                 便携运行时（jlink 裁剪，目标机无需装 Java）
#
#  三步：javac → jar → 组装 dist
# ============================================================
set -e
cd "$(dirname "$0")"

MODULES="java.base,java.desktop,java.net.http,java.logging,jdk.crypto.ec"

# ---- 0. 版本一致性自检 ----
VER_JAVA=$(grep -oP 'VERSION = "\K[0-9]+\.[0-9]+\.[0-9]+' src/main/java/com/groupblacknet/client/core/Config.java || echo "?")
VER_RC=$(grep -oP '^\s*FILEVERSION\s+\K[0-9,]+' launcher/win/resource.rc 2>/dev/null | head -1 || echo "?")
echo "[版本] Config.java=$VER_JAVA  resource.rc=$VER_RC"

if ! command -v javac >/dev/null 2>&1; then
  echo "[错误] 未找到 javac，请安装 JDK 21 并把 bin 加入 PATH。"
  exit 1
fi

# ---- 1. 编译 ----
rm -rf out/classes
mkdir -p out/classes
find src/main/java -name '*.java' > out/sources.txt
javac -encoding UTF-8 -d out/classes @out/sources.txt

if [ -d src/main/resources ]; then
  cp -r src/main/resources/. out/classes/
fi

# ---- 2. 打包 jar ----
rm -f out/GroupBlackNet-Client.jar
jar --create --file out/GroupBlackNet-Client.jar \
    --main-class com.groupblacknet.client.App -C out/classes .
echo "[完成] jar：out/GroupBlackNet-Client.jar"

# ---- 3. 组装 dist ----
rm -rf dist
mkdir -p dist
cp out/GroupBlackNet-Client.jar dist/GroupBlackNet.jar
cp launcher/GroupBlackNet.json dist/GroupBlackNet.json

# 3.1 便携运行时
JAVAC_PATH=$(command -v javac)
JLINK="$(dirname "$JAVAC_PATH")/jlink"
if [ -x "$JLINK" ]; then
  echo "[信息] jlink 裁剪运行时（$MODULES）"
  "$JLINK" --add-modules "$MODULES" \
      --strip-debug --no-header-files --no-man-pages --compress=zip-6 \
      --output dist/jre
  echo "[完成] 运行时：$(du -sh dist/jre | cut -f1)"
else
  echo "[警告] 未找到 jlink，dist 里不含 jre/。目标机需要自行安装 JDK 21，"
  echo "        或把 jrePath 留空让启动器回退到系统 PATH 上的 java。"
fi

# 3.2 原生启动器
if command -v go >/dev/null 2>&1; then
  echo "[信息] 编译启动器（Go）"
  (
    cd launcher/win
    if command -v windres >/dev/null 2>&1 && [ -f resource.rc ]; then
      windres -i resource.rc -o rsrc_windows_amd64.syso \
        --codepage=65001 --target=pe-x86-64 -O coff
    fi
    GOCACHE="${GOCACHE:-$PWD/.gocache}" \
      go build -trimpath -ldflags "-s -w -H=windowsgui" \
      -o ../../dist/GroupBlackNet.exe .
  )
  echo "[完成] 启动器：dist/GroupBlackNet.exe"
else
  echo "[警告] 未找到 go，dist 里没有 exe。可只分发 jar + jre："
  echo "        dist/jre/bin/javaw.exe -cp dist/GroupBlackNet.jar com.groupblacknet.client.App"
fi

# ---- 4. 汇总 ----
echo
echo "[完成] 分发目录 dist/"
ls -lh dist | sed '1d'
echo
echo "运行：dist/GroupBlackNet.exe"
echo "日志：dist/GroupBlackNet.log（启动器与 Java 侧输出都在这里）"
