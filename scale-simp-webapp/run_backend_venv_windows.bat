@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Error: .venv was not found. Please run start_webapp_venv_windows.bat first.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" -m uvicorn backend.main:app --app-dir "%~dp0" --reload --port 8000
pause
