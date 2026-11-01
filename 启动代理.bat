@echo off
chcp 936 >nul
title GBN Local Proxy
cd /d K:\GroupBlackNet

echo ============================================
echo   GBN Local Proxy  -  http://127.0.0.1:8907
echo   usage: /proxy/^(host^)/^(path^)
echo ============================================
echo.

rem check node
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node not found in PATH
  pause
  exit /b 1
)

rem port from arg, default 8907
set PORT=8907
if not "%~1"=="" set PORT=%~1

echo [INFO] whitelist: scripts\proxy-allow.txt  ^(edit to add domains^)
echo [INFO] press Ctrl+C to stop
echo.

node scripts\local-proxy.mjs %PORT%

echo.
echo [INFO] proxy exited
pause
