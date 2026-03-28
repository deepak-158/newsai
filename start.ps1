Write-Host "Starting ET IntelliSphere Environment..." -ForegroundColor Cyan

# Start Backend
Write-Host "Starting Backend Services..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k", "cd backend && call venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"

# Start Frontend
Write-Host "Starting Frontend UI..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k", "cd frontend && npm run dev"

Write-Host "Both services have been started in new windows!" -ForegroundColor Green
