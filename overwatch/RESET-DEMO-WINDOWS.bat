@echo off
cd /d "%~dp0"
echo Clearing all old demo records. The Overwatch server must be stopped first.
node --env-file-if-exists=.env reset-demo.mjs --yes
if errorlevel 1 (
  echo Reset did not complete. Read the message above.
  pause
  exit /b 1
)
echo Run START-WINDOWS.bat next, then reload Overwatch on the laptop and phone.
pause
