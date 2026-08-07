@echo off
setlocal
title SJKM OLT Monitoring - Professional Setup

echo ╔══════════════════════════════════════════════════════╗
echo ║          SJKM ISP MONITORING SYSTEM : SETUP           ║
echo ╚══════════════════════════════════════════════════════╝
echo.

:: 1. Add portable node to PATH
set "PATH=%~dp0_bin;%PATH%"

:: 2. Check for Node.js
if %errorlevel% neq 0 (
    echo [MISSING] Node.js is NOT installed on this laptop!
    echo.
    echo [ACTION] Please wait... I am downloading the official Node.js Installer for you.
    echo (This will only take a moment)
    echo.
    
    :: Use PowerShell to download the MSI
    powershell -Command "Write-Host '⬇️ Downloading Node.js v20.11.1 (LTS)...' -ForegroundColor Cyan; try { Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile 'node_installer.msi' -ErrorAction Stop; Write-Host '✅ Download Complete!' -ForegroundColor Green } catch { Write-Host '❌ Download Failed! Please check your internet.' -ForegroundColor Red; pause; exit }"
    
    if exist "node_installer.msi" (
        echo.
        echo [ACTION] Launching Node.js Installer...
        echo Please follow the setup wizard and click 'Finish' when done.
        start /wait node_installer.msi
        
        echo.
        echo [SUCCESS] Node.js Installation finished.
        echo [IMPORTANT] Please CLOSE this window and RE-RUN SETUP.bat to finish.
        del node_installer.msi
        pause
    )
    exit
)

echo [OK] Node.js detected: 
node -v
echo.

:: 2. Install Dependencies
echo [STEP 1] Installing required software packages...
echo (Please wait, this may take 1-3 minutes depending on your internet)
call npm.cmd install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Installation failed!
    echo 👉 Please check if your INTERNET is working.
    echo 👉 Try running: "npm install" manually if this persists.
    pause
    exit
)
echo [OK] All dependencies installed.
echo.

:: 3. Prepare .env file
if not exist ".env" (
    echo [STEP 2] Initial Configuration Required.
    echo --------------------------------------------------
    set /p ISP_NAME="Enter your Company/ISP Name: "
    set /p MT_HOST="Enter your MikroTik IP (e.g. 192.168.1.1): "
    set /p MT_PASS="Enter your MikroTik Password: "
    set /p GCASH="Enter your GCash Mobile Number: "
    echo --------------------------------------------------

    echo MIKROTIK_HOST=%MT_HOST%> .env
    echo MIKROTIK_PORT=8728>> .env
    echo MIKROTIK_USER=admin>> .env
    echo MIKROTIK_PASSWORD=%MT_PASS%>> .env
    echo SMTP_USER=your-email@gmail.com>> .env
    echo SMTP_PASS=your-app-password>> .env
    echo ALLOW_REMOTE_ADMIN=true>> .env
    echo SESSION_SECRET=isp-%RANDOM%-%RANDOM%>> .env
    
    echo [OK] .env file created successfully.
) else (
    echo [SKIP] .env file already exists.
)

echo.
echo ──────────────────────────────────────────────────
echo ✅ SETUP COMPLETE!
echo ──────────────────────────────────────────────────
echo.
echo To start your system, run the START_SERVER.bat file.
echo.
pause
