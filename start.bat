@echo off
echo [ET IntelliSphere] Starting Development Environment...

REM Start Backend in a new window
echo Starting Backend (FastAPI)...
start "Backend Services" cmd /k "cd backend && call venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"

REM Start Frontend in a new window
echo Starting Frontend (Next.js)...
start "Frontend UI" cmd /k "cd frontend && npm run dev"

echo.
echo Both services are booting up in separate terminal windows.
echo You can close this window now.
pause
