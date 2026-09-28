@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or later from https://nodejs.org first, then run this file again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 (
  echo This app requires Node.js 24 or later. Please update Node.js.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo A new .env file was created. You can add your OpenAI API key there later.
)
echo Starting Overwatch. Keep this window open.
node --env-file-if-exists=.env server.mjs
pause
