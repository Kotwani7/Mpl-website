@echo off
setlocal
cd /d "%~dp0"

echo Checking Node.js version...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22.16 or later from https://nodejs.org/
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22 || (a===22 && b<16)) process.exit(1)"
if errorlevel 1 (
  echo This project requires Node.js 22.16 or later for the built-in SQLite database.
  echo Current version: 
  node --version
  echo Update Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
  echo Created backend\.env with a local organiser key.
)

if not exist "node_modules\.bin\concurrently.cmd" goto install_deps
if not exist "node_modules\.bin\vite.cmd" goto install_deps
goto start_services

:install_deps
echo Installing MPL website dependencies with npm...
call npm install
if errorlevel 1 (
  echo Dependency installation failed. Check your internet connection and Node.js/npm installation.
  pause
  exit /b 1
)

:start_services
echo Checking the SQLite database before startup...
call npm run db:check
if errorlevel 1 (
  echo Database check failed. Review the error above before opening the website.
  pause
  exit /b 1
)
echo Starting MPL frontend and SQLite backend...
call npm run dev
pause
