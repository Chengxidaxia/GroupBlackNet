@echo off
rem ==========================================================
rem  build bn.exe  (mingw-w64 g++ ; WinHTTP + BCrypt + zlib only)
rem  run:  build.bat
rem  out:  build\bn.exe
rem ==========================================================
setlocal
cd /d "%~dp0"

set GXX=K:/Programs/msys64/mingw64/bin/g++.exe
if not exist "%GXX%" set GXX=g++

rem gcc writes temp files to C:/Windows by default on this machine -> redirect
set TMPDIR=%~dp0build\tmp
set TMP=%TMPDIR%
set TEMP=%TMPDIR%
if not exist "%TMPDIR%" mkdir "%TMPDIR%"
if not exist "build" mkdir "build"

"%GXX%" -std=c++17 -O2 -pipe -I. -Wall -Wextra -Wno-unused-parameter ^
  -Wno-missing-field-initializers -Wno-unknown-pragmas ^
  src\*.cpp -o build\bn.exe -static -s ^
  -lwinhttp -lbcrypt -lcrypt32 -lshell32 -lz

if errorlevel 1 (
  echo.
  echo BUILD FAILED
  exit /b 1
)
echo.
echo OK: %~dp0build\bn.exe
