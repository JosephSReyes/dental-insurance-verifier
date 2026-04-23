@echo off
echo ========================================
echo Installing pgvector for PostgreSQL 16
echo ========================================
echo.

set PG_VERSION=16
set PG_DIR=C:\Program Files\PostgreSQL\%PG_VERSION%
set PGVECTOR_VERSION=0.7.4

echo Downloading pgvector v%PGVECTOR_VERSION% for Windows...
echo.

REM Create temp directory
if not exist "%TEMP%\pgvector" mkdir "%TEMP%\pgvector"
cd "%TEMP%\pgvector"

REM Download pgvector precompiled binary for Windows
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/pgvector/pgvector/releases/download/v%PGVECTOR_VERSION%/pgvector-v%PGVECTOR_VERSION%-pg%PG_VERSION%-windows-amd64.zip' -OutFile 'pgvector.zip'"

if %errorLevel% neq 0 (
    echo.
    echo ERROR: Failed to download pgvector
    echo Trying alternative method...
    echo.
    
    REM Alternative: Try to build from source (requires Visual Studio)
    echo This requires Visual Studio Build Tools.
    echo Please install from: https://visualstudio.microsoft.com/downloads/
    echo.
    pause
    exit /b 1
)

echo.
echo Extracting pgvector...
powershell -Command "Expand-Archive -Path 'pgvector.zip' -DestinationPath '.' -Force"

echo.
echo Installing pgvector to PostgreSQL directory...
echo Target: %PG_DIR%

REM Copy extension files
copy /Y "vector.control" "%PG_DIR%\share\extension\" 2>nul
copy /Y "vector--*.sql" "%PG_DIR%\share\extension\" 2>nul
copy /Y "vector.dll" "%PG_DIR%\lib\" 2>nul

if %errorLevel% neq 0 (
    echo.
    echo ERROR: Failed to copy files. This usually means:
    echo   1. This script needs to run as Administrator
    echo   2. PostgreSQL is not installed in the default location
    echo.
    echo Please run this script as Administrator.
    pause
    exit /b 1
)

echo.
echo ✓ pgvector installed successfully!
echo.
echo Restarting PostgreSQL service...
net stop postgresql-x64-%PG_VERSION%
timeout /t 2 /nobreak >nul
net start postgresql-x64-%PG_VERSION%

echo.
echo ========================================
echo Installation complete!
echo ========================================
echo.
echo Now you can run: npm run db:init
echo.
pause
