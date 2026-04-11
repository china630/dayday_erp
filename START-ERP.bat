@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Cleaning API dist...
if exist "apps\api\dist" rd /s /q "apps\api\dist"
:: Даем Windows 1 секунду освободить дескрипторы файлов
timeout /t 1 /nobreak >nul

echo [2/3] Building database + API...
:: npm workspaces: -w (не --filter — это pnpm). Сборка @dayday/database даёт prisma generate.
call npm run build -w @dayday/database -w @dayday/api

echo [3/3] Starting Dev Mode (API + Web)...
call npm run dev
pause
