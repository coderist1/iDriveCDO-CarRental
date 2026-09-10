@echo off
cd /d "%~dp0"
title iDrive CDO server

echo.
echo  iDrive CDO local server
echo  Folder: %CD%
echo  URL:    http://localhost:8080/home/index.html
echo.
echo  Keep this window open while using the app.
echo  Press Ctrl+C to stop the server.
echo.

REM Free port 8080 if an old server is still running
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
  echo  Stopping old process on port 8080 (PID %%P)...
  taskkill /F /PID %%P >nul 2>&1
)

timeout /t 1 /nobreak >nul
start "" "http://localhost:8080/home/index.html"

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -m http.server 8080
  goto :eof
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python -m http.server 8080
  goto :eof
)

echo  ERROR: Python was not found.
echo  Install Python, or run: py -m http.server 8080
pause
