@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Error: npm was not found. Please install Node.js LTS first:
  echo https://nodejs.org/en/download
  pause
  exit /b 1
)

set "PYTHON_LAUNCHER="
where py >nul 2>nul
if not errorlevel 1 (
  py -3.12 --version >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_LAUNCHER=py -3.12"
  ) else (
    py -3.11 --version >nul 2>nul
    if not errorlevel 1 (
      set "PYTHON_LAUNCHER=py -3.11"
    ) else (
      py -3 --version >nul 2>nul
      if not errorlevel 1 (
        set "PYTHON_LAUNCHER=py -3"
      )
    )
  )
)

if not defined PYTHON_LAUNCHER (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_LAUNCHER=python"
  )
)

if not defined PYTHON_LAUNCHER (
  echo Error: Python was not found. Please install Python 3.11 or 3.12 first.
  pause
  exit /b 1
)

if not exist ".venv" (
  echo Python virtual environment was not found. Creating .venv...
  %PYTHON_LAUNCHER% -m venv .venv
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

set "PYTHON_CMD=.venv\Scripts\python.exe"
set "UVICORN_CMD=.venv\Scripts\uvicorn.exe"

if not exist "%UVICORN_CMD%" (
  echo Backend dependencies are missing. Installing requirements.txt...
  "%PYTHON_CMD%" -m pip install --upgrade pip
  if errorlevel 1 (
    pause
    exit /b 1
  )
  "%PYTHON_CMD%" -m pip install -r requirements.txt
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if not exist node_modules (
  echo Frontend dependencies are missing. Running npm install...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo Starting Scale-Simp WebApp with local .venv...
echo Backend:  http://127.0.0.1:8000/docs
echo Frontend: http://localhost:5173/

start "Scale-Simp Backend" "%~dp0run_backend_venv_windows.bat"
start "Scale-Simp Frontend" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo Two terminal windows were opened for the backend and frontend.
pause
