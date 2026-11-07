@echo off
chcp 936 >nul
rem ============================================================
rem  GroupBlackNet Client - build (Windows / CMD)
rem
rem  产物目录 dist\（与 Mindustry 的分发形态一致）：
rem    GroupBlackNet.exe    原生启动器（Go 编译，读同名 json）
rem    GroupBlackNet.json   配置（jrePath / classPath / mainClass / vmArgs）
rem    GroupBlackNet.jar    应用本体（外置，不内嵌进 exe）
rem    jre\                 便携运行时（jlink 裁剪，目标机无需装 Java）
rem
rem  三步：javac -> jar -> 组装 dist
rem ============================================================
setlocal
cd /d "%~dp0"

set "MODULES=java.base,java.desktop,java.net.http,java.logging,jdk.crypto.ec"

where javac >nul 2>nul
if errorlevel 1 (
  echo [ERROR] javac not found. Install JDK 21 and add its bin to PATH.
  exit /b 1
)

for %%I in (javac.exe) do set "JBIN=%%~dp$PATH:I"

echo [1/4] compile
if exist out\classes rmdir /s /q out\classes
mkdir out\classes
dir /s /b src\main\java\*.java > out\sources.txt
javac -encoding UTF-8 -d out\classes @out\sources.txt
if errorlevel 1 (
  echo [ERROR] compile failed.
  exit /b 1
)
if exist src\main\resources xcopy src\main\resources out\classes /E /I /Y >nul

echo [2/4] jar
if exist out\GroupBlackNet-Client.jar del /q out\GroupBlackNet-Client.jar
jar --create --file out\GroupBlackNet-Client.jar --main-class com.groupblacknet.client.App -C out\classes .
if errorlevel 1 (
  echo [ERROR] jar failed.
  exit /b 1
)

echo [3/4] assemble dist
if exist dist rmdir /s /q dist
mkdir dist
copy /y out\GroupBlackNet-Client.jar dist\GroupBlackNet.jar >nul
copy /y launcher\GroupBlackNet.json dist\GroupBlackNet.json >nul

rem ---- portable runtime ----
if exist "%JBIN%jlink.exe" (
  echo       jlink %MODULES%
  "%JBIN%jlink.exe" --add-modules %MODULES% --strip-debug --no-header-files --no-man-pages --compress=zip-6 --output dist\jre
  if errorlevel 1 (
    echo [WARN] jlink failed. dist has no jre\; target machine needs JDK 21.
  )
) else (
  echo [WARN] jlink not found. dist has no jre\.
)

echo [4/4] launcher
where go >nul 2>nul
if not errorlevel 1 (
  pushd launcher\win
  if exist resource.rc (
    where windres >nul 2>nul
    if not errorlevel 1 windres -i resource.rc -o rsrc_windows_amd64.syso --codepage=65001 --target=pe-x86-64 -O coff
  )
  set "GOCACHE=%CD%\.gocache"
  go build -trimpath -ldflags "-s -w -H=windowsgui" -o ..\..\dist\GroupBlackNet.exe .
  if errorlevel 1 echo [WARN] go build failed, dist has no exe.
  popd
) else (
  echo [WARN] go not found, dist has no exe.
  echo        You can still ship jar + jre:
  echo        dist\jre\bin\javaw.exe -cp dist\GroupBlackNet.jar com.groupblacknet.client.App
)

echo.
echo [DONE] dist\
dir /b dist
echo.
echo Run  : dist\GroupBlackNet.exe
echo Log  : dist\GroupBlackNet.log
endlocal
