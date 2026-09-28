@echo off
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Install Cloudflare Tunnel from the official Cloudflare documentation first.
  echo Or run: winget install --id Cloudflare.cloudflared --exact
  echo Then reopen this file in a new terminal session.
  pause
  exit /b 1
)
echo This creates a temporary public HTTPS address protected by your app access code.
echo Start Overwatch first. Set TRUST_PROXY=true in .env and restart the app.
echo Keep this window AND the Overwatch server window open during the demo.
cloudflared tunnel --url http://localhost:3000
pause
