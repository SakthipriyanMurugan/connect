# VERTEX CONNECT - Quick Local Development Launcher (0-Cost Architecture)
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  VERTEX CONNECT - DEV ENVIRONMENT       " -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan

# Start Backend in a background process (automatically uses .venv if present)
Write-Host "[1/2] Starting FastAPI Backend (http://localhost:8000)..." -ForegroundColor Green
$venvPython = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
$pyCmd = if (Test-Path $venvPython) { ".\.venv\Scripts\python.exe" } else { "python" }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot/backend'; $pyCmd -m uvicorn app.main:app --reload --port 8000"

# Start Frontend in current terminal
Write-Host "[2/2] Starting React + Vite Frontend (http://localhost:5173)..." -ForegroundColor Green
cd "$PSScriptRoot/frontend"
npm run dev
