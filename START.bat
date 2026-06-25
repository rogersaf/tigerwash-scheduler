@echo off
echo Starting Tiger Wash Scheduler...
echo.
echo Backend  -> http://localhost:3001
echo Frontend -> http://localhost:5173
echo.
start "TigerWash Server" cmd /k "cd /d %~dp0server && node index.js"
timeout /t 2 /nobreak >nul
start "TigerWash Client" cmd /k "cd /d %~dp0client && npm run dev"
timeout /t 3 /nobreak >nul
start http://localhost:5173
