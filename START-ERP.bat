@echo off
setlocal
cd /d "%~dp0"

echo [1/4] Freeing dev ports 3000 ^(Next.js^) and 4000 ^(API^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = 3000,4000; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

echo [2/4] Cleaning API dist...
if exist "apps\api\dist" rd /s /q "apps\api\dist"
:: Даем Windows 1 секунду освободить дескрипторы файлов
timeout /t 1 /nobreak >nul

echo [3/4] Building database + API...
:: npm workspaces: -w (не --filter — это pnpm). Сборка @dayday/database даёт prisma generate.
call npm run build -w @dayday/database -w @dayday/api

echo [4/4] Starting Dev Mode (API + Web)...
call npm run dev
pause
