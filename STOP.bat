@echo off
title ISP Management System - Uninstall
color 0C
echo.
echo  WARNING: This will stop the system and remove all data.
echo  Are you sure? Press CTRL+C to cancel, or...
pause

taskkill /f /im node.exe >nul 2>&1
echo  System stopped.
pause
