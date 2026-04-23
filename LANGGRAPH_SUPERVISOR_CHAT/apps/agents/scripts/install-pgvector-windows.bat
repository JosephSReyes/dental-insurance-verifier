@echo off
echo ========================================
echo Installing pgvector for PostgreSQL 16
echo ========================================
echo.

REM Set PostgreSQL paths
set PG_VERSION=16
set PG_DIR=C:\Program Files\PostgreSQL\%PG_VERSION%
set PG_BIN=%PG_DIR%\bin
set PG_LIB=%PG_DIR%\lib
set PG_SHARE=%PG_DIR%\share\extension

echo PostgreSQL directory: %PG_DIR%
echo.

REM Download pgvector source
echo Step 1: Downloading pgvector source code...
cd %TEMP%
if exist pgvector-0.7.4 rmdir /s /q pgvector-0.7.4
curl -L -o pgvector.zip https://github.com/pgvector/pgvector/archive/refs/tags/v0.7.4.zip
if %errorLevel% neq 0 (
    echo ERROR: Failed to download pgvector
    pause
    exit /b 1
)

echo.
echo Step 2: Extracting source code...
powershell -Command "Expand-Archive -Path 'pgvector.zip' -DestinationPath '.' -Force"
cd pgvector-0.7.4

echo.
echo Step 3: Building pgvector using PostgreSQL's build system...
echo.
echo Note: This requires Visual Studio Build Tools or MinGW

REM Try using PostgreSQL's included build tools
"%PG_BIN%\pg_config.exe" --version
if %errorLevel% neq 0 (
    echo ERROR: pg_config not found
    pause
    exit /b 1
)

REM For Windows, we'll use nmake (requires Visual Studio)
echo.
echo Checking for nmake (Visual Studio Build Tools)...
where nmake >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ERROR: Visual Studio Build Tools not found.
    echo.
    echo Please install Visual Studio 2022 Build Tools from:
    echo https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
    echo.
    echo OR use Docker/WSL2 as an alternative (see documentation)
    echo.
    pause
    exit /b 1
)

REM Build using nmake
echo Building pgvector...
call "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
nmake /F Makefile.win PGROOT="%PG_DIR%"

if %errorLevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo Step 4: Installing pgvector...
nmake /F Makefile.win install PGROOT="%PG_DIR%"

if %errorLevel% neq 0 (
    echo ERROR: Installation failed (may need Administrator privileges)
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
echo Now run: npm run db:init
echo.
pause
