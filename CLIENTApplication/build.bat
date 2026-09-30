@echo off
chcp 936 >nul
rem ============================================================
rem  群档案客户端 · 构建（Windows / CMD）
rem  1) javac 编译到 out\classes
rem  2) jar 打包 out\GroupBlackNet-Client.jar（可执行 jar）
rem  3) 若找到 Launch4j，再生成 out\GroupBlackNet.exe（启动器）
rem  产物都在 out\ 下，已在 .gitignore 中忽略
rem ============================================================
setlocal
cd /d "%~dp0"

where javac >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 javac，请安装 JDK 21 并把 bin 加入 PATH。
  exit /b 1
)

if exist out\classes rmdir /s /q out\classes
mkdir out\classes

dir /s /b src\main\java\*.java > out\sources.txt
javac -encoding UTF-8 -d out\classes @out\sources.txt
if errorlevel 1 (
  echo [失败] 编译出错，请查看上面的错误信息。
  exit /b 1
)

if exist src\mainesources xcopy src\mainesources out\classes /E /I /Y >nul

rem ---- 打包可执行 jar（零第三方依赖，Main-Class 直接写进 manifest）----
if exist out\GroupBlackNet-Client.jar del /q out\GroupBlackNet-Client.jar
jar --create --file out\GroupBlackNet-Client.jar --main-class com.groupblacknet.client.App -C out\classes .
if errorlevel 1 (
  echo [失败] 打包 jar 失败。
  exit /b 1
)
echo [完成] 可执行包：out\GroupBlackNet-Client.jar

rem ---- 可选：用 Launch4j 生成 Windows 启动器 exe ----
rem 查找顺序：launcher\launch4j.path 文件 → 环境变量 LAUNCH4J_HOME → PATH 上的 launch4jc
set "L4J="
if exist "launcher\launch4j.path" for /f "usebackq delims=" %%p in ("launcher\launch4j.path") do set "L4J=%%p"
if not defined L4J if defined LAUNCH4J_HOME set "L4J=%LAUNCH4J_HOME%"
if not defined L4J for %%I in (launch4jc.exe) do if not defined L4J set "L4J=%%~dpI"
if defined L4J if "%L4J:~-1%"=="\" set "L4J=%L4J:~0,-1%"

if defined L4J if exist "%L4J%\launch4jc.exe" (
  echo [信息] 使用 Launch4j：%L4J%
  "%L4J%\launch4jc.exe" "launcher\launch4j-config.xml"
  if errorlevel 1 (
    echo [警告] Launch4j 生成 exe 失败（jar 已可用，不影响运行）。
  ) else (
    echo [完成] 启动器：out\GroupBlackNet.exe
  )
  goto :done
)

echo [跳过] 未找到 Launch4j，本次只生成 jar。要生成启动器 exe，任选其一：
echo        1^) 把 launch4jc.exe 所在目录写入 launcher\launch4j.path
echo        2^) 设置环境变量 LAUNCH4J_HOME
echo        3^) 把 launch4jc.exe 所在目录加入 PATH
echo        下载：https://sourceforge.net/projects/launch4j/files/launch4j-3/3.50/

:done
echo.
echo [完成] 编译输出：out\classes
echo         运行：run.bat   或   java -jar out\GroupBlackNet-Client.jar
endlocal
