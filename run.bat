@echo off
title Apex WMS Launcher
echo ===================================================
echo   Starting Apex Warehouse Management System (WMS)
echo ===================================================

echo.
echo Launching Python Flask Backend...
start "WMS Backend" cmd /k "cd backend && C:\Users\AntonyKuriyanK\AppData\Local\Programs\Python\Python312\python.exe app.py"

echo Launching React Frontend (Vite)...
start "WMS Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo   System running!
echo   Frontend: http://localhost:5173
echo   Backend APIs: http://localhost:5000
echo ===================================================
echo.
pause
