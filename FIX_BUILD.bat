@echo off
echo 🚀 STARTING FIX BUILD...
echo ---------------------------------------

echo 🧹 Cleaning up old files...
if exist dist rmdir /s /q dist
if exist engine.tar.gz del /f /q engine.tar.gz
if exist better_sqlite3.node del /f /q better_sqlite3.node

echo ⚙️ Reinstalling node modules...
call npm install
call npm rebuild better-sqlite3

echo ---------------------------------------
echo ✅ RECOVERY COMPLETE!
echo.
echo 🚀 You can now test your system by running START_SERVER.bat
echo.
pause
