@echo off
cd /d "%~dp0"
echo.
echo  iDrive CDO Maintenance ML API
echo  URL: http://localhost:8001
echo  Docs: http://localhost:8001/docs
echo.
python -m uvicorn app:app --app-dir "%~dp0" --reload-dir "%~dp0" --host 127.0.0.1 --port 8001 --reload
pause
