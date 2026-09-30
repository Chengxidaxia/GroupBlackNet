@echo off
chcp 936 >nul
rem ============================================================
rem  群档案客户端 · 运行（Windows / CMD）
rem  优先用 Launch4j 生成的 exe；没有就用 jar；都没有就先 build
rem  可选参数：--page=home^|detail^|editor^|about^|contact  --d^=<文章号>  --theme=light^|dark
rem ============================================================
setlocal
cd /d "%~dp0"

if exist out\GroupBlackNet.exe (
  start "" out\GroupBlackNet.exe %*
  goto :eof
)

if not exist out\GroupBlackNet-Client.jar (
  echo [提示] 尚未构建，先执行 build.bat …
  call build.bat
  if errorlevel 1 exit /b 1
)

java -Dfile.encoding=UTF-8 -jar out\GroupBlackNet-Client.jar %*
endlocal
