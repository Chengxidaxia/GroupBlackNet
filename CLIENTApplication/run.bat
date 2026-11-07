@echo off
chcp 936 >nul
rem ============================================================
rem  GroupBlackNet Client - run (Windows / CMD)
rem  优先 dist\GroupBlackNet.exe（便携包，自带 jre），
rem  其次 dist\jre + jar，最后才用系统 java -jar out\...
rem  参数会透传：--page=home|detail|editor|about|contact  --d=<编号>  --theme=light|dark
rem ============================================================
setlocal
cd /d "%~dp0"

if exist dist\GroupBlackNet.exe (
  start "" dist\GroupBlackNet.exe %*
  goto :eof
)

if exist dist\jre\bin\javaw.exe if exist dist\GroupBlackNet.jar (
  start "" dist\jre\bin\javaw.exe -Dfile.encoding=UTF-8 -cp dist\GroupBlackNet.jar com.groupblacknet.client.App %*
  goto :eof
)

if not exist out\GroupBlackNet-Client.jar (
  echo [INFO] not built yet, running build.bat ...
  call build.bat
  if errorlevel 1 exit /b 1
)

java -Dfile.encoding=UTF-8 -jar out\GroupBlackNet-Client.jar %*
endlocal
