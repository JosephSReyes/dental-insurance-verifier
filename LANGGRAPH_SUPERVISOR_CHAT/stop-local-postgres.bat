@echo off
echo ========================================
echo Stop Local PostgreSQL Service
echo ========================================
echo.
echo This script will stop the local PostgreSQL service
echo to avoid port conflicts with Docker PostgreSQL.
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires administrator privileges.
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo Stopping local PostgreSQL service...
net stop postgresql-x64-16

if %errorLevel% equ 0 (
    echo [SUCCESS] Local PostgreSQL service stopped
    echo.
    echo You can now run start-debug.bat to use Docker PostgreSQL
) else (
    echo [WARNING] Could not stop PostgreSQL service
    echo The service may not be running or have a different name
)

echo.
echo To restart local PostgreSQL later, run:
echo   net start postgresql-x64-16
echo.
pause
