@echo off
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8000/"
where python >nul 2>nul
if %errorlevel%==0 ( python serve.py 8000 ) else ( node server.mjs 8000 )
pause
