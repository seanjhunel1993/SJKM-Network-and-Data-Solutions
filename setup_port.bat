@echo off
title ISP Portal Port Setup
color 0A

echo ==================================================
echo         ISP SYSTEM - CLIENT SETUP TOOL
echo ==================================================
echo.

setlocal enabledelayedexpansion
set "envFile=.env"

:: Ask you for the new port
set /p newPort="Enter the new port number for this client (e.g., 3000, 3001): "

:: Check if .env file exists
if not exist "%envFile%" (
    echo PORT=%newPort%> "%envFile%"
    echo [OK] Created a new .env file with Port %newPort%.
) else (
    :: Safely remove the old PORT number and add the new one
    findstr /v "^PORT=" "%envFile%" > "%envFile%.tmp"
    echo PORT=%newPort%>> "%envFile%.tmp"
    move /y "%envFile%.tmp" "%envFile%" > nul
    echo [OK] Successfully updated .env file to Port %newPort%.
)

echo.
echo ==================================================
echo SUCCESS! Your terminal will now launch on Localhost:%newPort%.
echo You can now open your Cloudflare Dashboard and point
echo the tunnel to localhost:%newPort%.
echo ==================================================
echo.
pause
