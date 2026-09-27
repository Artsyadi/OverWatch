@echo off
title Overwatch Local Demo
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22.12 or later, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Installing Overwatch dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo.
echo Open http://localhost:3000 in your browser when the server is ready.
echo Keep this window open while using the demo. Ctrl+C stops the server.
echo An API key is optional. The rules-based demo works without one.
echo.
call npm.cmd run dev
pause
