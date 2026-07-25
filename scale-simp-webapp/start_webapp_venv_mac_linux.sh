#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm was not found. Please install Node.js LTS first:"
  echo "https://nodejs.org/en/download"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 was not found. Please install Python 3.11 or 3.12 first."
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "Python virtual environment was not found. Creating .venv..."
  python3 -m venv .venv
fi

PYTHON_CMD=".venv/bin/python"
UVICORN_CMD=".venv/bin/uvicorn"

if [ ! -x "$UVICORN_CMD" ]; then
  echo "Backend dependencies are missing. Installing requirements.txt..."
  "$PYTHON_CMD" -m pip install --upgrade pip
  "$PYTHON_CMD" -m pip install -r requirements.txt
fi

if [ ! -d "node_modules" ]; then
  echo "Frontend dependencies are missing. Running npm install..."
  npm install
fi

echo "Starting Scale-Simp WebApp with local .venv..."
echo "Backend:  http://127.0.0.1:8000/docs"
echo "Frontend: http://localhost:5173/"

"$UVICORN_CMD" backend.main:app --reload --port 8000 &
BACKEND_PID=$!

cleanup() {
  echo
  echo "Stopping backend..."
  kill "$BACKEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

npm run dev
