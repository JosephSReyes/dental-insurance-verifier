@echo off
rem Set UTF-8 encoding for proper character display
chcp 65001 >nul 2>&1

rem Enable delayed expansion for better error handling
rem This allows us to capture error codes reliably within code blocks
setlocal enabledelayedexpansion

echo [INFO] Checking Docker Desktop status...
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>NUL | find /I /N "Docker Desktop.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [INFO] Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo [INFO] Waiting for Docker to start...
    timeout /t 20 /nobreak >nul
)

echo [INFO] Starting PostgreSQL with pgvector in Docker...
docker compose up -d postgres
if errorlevel 1 (
    echo [ERROR] Failed to start PostgreSQL container
    echo [INFO] Trying to remove existing container and restart...
    docker compose down postgres
    docker compose up -d postgres
)

echo [INFO] Waiting for PostgreSQL to be ready...
timeout /t 10 /nobreak >nul

echo [INFO] Checking PostgreSQL health...
docker compose ps postgres
if errorlevel 1 (
    echo [WARNING] PostgreSQL container may not be healthy yet
) else (
    echo [INFO] PostgreSQL is running with pgvector support
)

echo [INFO] Installing Node.js dependencies...
echo [DEBUG] Changing to directory: %~dp0apps\agents
cd /d "%~dp0apps\agents"
echo [DEBUG] Current directory: !CD!
echo [DEBUG] Running: pnpm install

call pnpm install
set PNPM_INSTALL_ERROR=!ERRORLEVEL!
echo [DEBUG] pnpm install returned errorlevel: !PNPM_INSTALL_ERROR!

if !PNPM_INSTALL_ERROR! neq 0 (
    echo [ERROR] Failed to install Node.js dependencies
    echo [ERROR] pnpm install returned error code: !PNPM_INSTALL_ERROR!
    echo [WARNING] Continuing anyway - you may need to run 'pnpm install' manually
    echo.
) else (
    echo [INFO] Node.js dependencies installed successfully
)

echo [DEBUG] Returning to root directory: %~dp0
cd /d "%~dp0"

echo.
echo ========================================================================
echo              STARTING MAIN APPLICATION
echo ========================================================================
echo.

echo [INFO] Starting web server in background...
cd apps\web
start "Web Server" cmd /k "pnpm run dev"
cd ..\..

echo.
echo [DEBUG] About to start agents server section
echo [DEBUG] Current directory before cd: %CD%
echo.
echo [INFO] Starting agents server in this window...
echo.

rem Ensure we're in the correct directory
cd /d "%~dp0"
if not exist "apps\agents" (
    echo [ERROR] apps\agents directory not found!
    echo [ERROR] Current directory: %CD%
    echo [ERROR] Cannot start agents server
    echo.
    echo [DEBUG] Cleaning up environment variables...
    endlocal
    echo Press any key to close this window...
    pause
    goto :EOF
)

cd apps\agents
echo [INFO] Current directory: %CD%
echo [INFO] Starting pnpm run dev...
echo [DEBUG] This will run the LangGraph development server
echo.

call pnpm run dev

echo.
echo ========================================================================
echo   Agents server has stopped
echo ========================================================================
echo.
echo [DEBUG] Cleaning up environment variables...
endlocal
echo Press any key to close this window...
pause >nul
