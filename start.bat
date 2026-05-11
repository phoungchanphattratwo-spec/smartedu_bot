@echo off
echo ============================================
echo   School Bot - Starting Backend Server
echo ============================================
echo.
echo Make sure you have filled in .env before running this.
echo.
cd /d "%~dp0backend"
pip install -r requirements.txt --quiet
echo.
echo Starting API server on http://localhost:8000
echo Press Ctrl+C to stop.
echo.
uvicorn main:app --reload --port 8000
