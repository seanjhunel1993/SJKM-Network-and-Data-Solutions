@echo off
title ISP Management System - Starting...
color 0A
cd /d "%~dp0"

echo.
echo  ===============================================
echo    ISP MANAGEMENT SYSTEM - Booting Up...
echo  ===============================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Node.js is NOT installed!
    echo.
    echo  Please install Node.js first:
    echo  1. Open your browser
    echo  2. Go to: https://nodejs.org
    echo  3. Download the LTS version
    echo  4. Install it, then run this file again.
    echo.
    pause
    exit /b 1
)

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules\" (
    echo  [SETUP] First-time setup: Installing dependencies...
    echo  This may take 1-2 minutes. Please wait...
    echo.
    call npm install --production
    echo.
    echo  [DONE] Dependencies installed!
    echo.
)

:: Check if .env exists, copy from example if not
if not exist ".env" (
    if exist ".env.example" c(
        copy ".env.example" ".env" >nul
    )
)

echo  ===============================================
echo   System ready! Opening browser in 3 seconds...
echo  ===============================================
echo.
echo   Admin Panel  : http://localhost:3998/admin/
echo.
echo   First time? Go to: http://localhost:3998/admin/setup.html
echo.

:: Wait 3 seconds then open browser
timeout /t 3 /nobreak >nul
start "" "http://localhost:3998/admin/"

:: Start the server
node server.js

pause
