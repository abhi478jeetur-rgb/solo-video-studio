@echo off
title Solo Video Studio
cd /d "%~dp0"
echo ===================================================
echo           Starting Solo Video Studio...
echo ===================================================

:: Check if server is already running on port 5000
netstat -ano | findstr /R /C:":5000 *LISTENING" >nul
if %ERRORLEVEL% EQU 0 (
    echo Server is already active on http://127.0.0.1:5000
    start http://127.0.0.1:5000
    exit /b
)

:: Start the Flask app using virtual environment Python in background/minimized
start "Solo Video Studio Backend" /min ".\venv\Scripts\python.exe" app.py
echo Waiting for server to initialize...
timeout /t 2 /nobreak >nul
start http://127.0.0.1:5000
exit
