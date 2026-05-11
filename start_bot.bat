@echo off
echo ============================================
echo   School Bot - Starting Telegram Bot
echo ============================================
echo.
cd /d "%~dp0bot"
pip install -r requirements.txt --quiet
echo.
echo Bot is starting... Press Ctrl+C to stop.
echo.
python bot.py
