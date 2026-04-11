@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Stopping API (releases Prisma query_engine lock)...
call npm run stop:api

echo [2/3] Stopping Next.js dev (if any)...
call npm run stop:next

echo Waiting 1s for file handles to release...
timeout /t 1 /nobreak >nul

echo [3/3] prisma generate (workspace @dayday/database)...
call npm run db:generate
if errorlevel 1 (
  echo.
  echo db:generate failed. See messages above.
  pause
  exit /b 1
)

echo.
echo Done.
pause

