@echo off
title Agent Chat Demo - Cleanup
echo.
echo ══════════════════════════════════════════════════════════════════════
echo              AGENT CHAT DEMO - CLEANUP UTILITY
echo ══════════════════════════════════════════════════════════════════════
echo.
echo This script will kill all running debug sessions and dev servers.
echo.

rem Kill browser-use Python service (ports 8000 and 3006)
echo [CLEANUP 1/6] Killing browser-use Python service...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 :3006" ^| findstr "LISTENING"') do (
    echo   - Killing process on port 8000/3006 ^(PID: %%a^)
    taskkill /F /PID %%a /T 2>nul
)

rem Kill Web Server (ports 3000, 3001, 3005)
echo [CLEANUP 2/6] Killing Web Server...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 :3001 :3005" ^| findstr "LISTENING"') do (
    echo   - Killing process on port 3000/3001/3005 ^(PID: %%a^)
    taskkill /F /PID %%a /T 2>nul
)

rem Kill Python processes running browser-use service
echo [CLEANUP 3/6] Killing remaining Python browser-use processes...
tasklist 2>nul | findstr "python.exe" >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2" %%a in ('tasklist 2^>nul ^| findstr "python.exe"') do (
        wmic process where "ProcessID=%%a" get CommandLine 2>nul | findstr "main.py\|browser-use-service\|uvicorn" >nul
        if not errorlevel 1 (
            echo   - Found browser-use Python process (PID: %%a^)
            taskkill /F /PID %%a /T >nul 2>&1
        )
    )
) else (
    echo   - No Python browser-use processes found
)

rem Kill remaining Node.js dev server processes
echo [CLEANUP 4/6] Killing remaining Node.js processes...
tasklist 2>nul | findstr "node.exe" >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2" %%a in ('tasklist 2^>nul ^| findstr "node.exe"') do (
        wmic process where "ProcessID=%%a" get CommandLine 2>nul | findstr "pnpm.*dev\|next dev" >nul
        if not errorlevel 1 (
            echo   - Found dev process (PID: %%a^)
            taskkill /F /PID %%a /T >nul 2>&1
        )
    )
) else (
    echo   - No Node.js processes found
)

rem Kill Chrome instances spawned by browser-use
echo [CLEANUP 5/6] Killing Chrome instances from browser-use...
tasklist 2>nul | findstr "chrome.exe" >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=2" %%a in ('tasklist 2^>nul ^| findstr "chrome.exe"') do (
        wmic process where "ProcessID=%%a" get CommandLine 2>nul | findstr "remote-debugging-port\|playwright" >nul
        if not errorlevel 1 (
            echo   - Found Chrome browser-use instance (PID: %%a^)
            taskkill /F /PID %%a /T >nul 2>&1
        )
    )
) else (
    echo   - No Chrome instances found
)

rem Close any remaining cmd windows running these services
echo [CLEANUP 6/6] Closing remaining service windows...
timeout /t 2 /nobreak >nul
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq cmd.exe" /FO LIST 2^>nul ^| findstr "PID:"') do (
    wmic process where "ProcessID=%%a" get CommandLine 2>nul | findstr /C:"main.py" /C:"pnpm run dev" /C:"next dev" >nul
    if not errorlevel 1 (
        echo   - Closing service cmd window ^(PID: %%a^)
        taskkill /F /PID %%a 2>nul
    )
)

echo.
echo ══════════════════════════════════════════════════════════════════════
echo Cleanup complete!
echo ══════════════════════════════════════════════════════════════════════
echo.
echo All services stopped:
echo   - browser-use Python service (ports 8000/3006)
echo   - Web Server (ports 3000/3001/3005)
echo   - Node.js processes
echo   - Chrome browser instances
echo   - All service windows closed
echo.
echo You can now run start-debug.bat to start fresh.
echo.
pause
