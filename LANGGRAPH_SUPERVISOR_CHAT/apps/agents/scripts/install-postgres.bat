@echo off
echo ========================================
echo PostgreSQL + pgvector Installation
echo ========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires administrator privileges.
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo Step 1: Checking for existing PostgreSQL installation...
where psql >nul 2>&1
if %errorLevel% equ 0 (
    echo PostgreSQL is already installed!
    psql --version
    echo.
    set /p CONTINUE="Do you want to continue anyway? (y/n): "
    if /i not "%CONTINUE%"=="y" exit /b 0
)

echo.
echo Step 2: Downloading PostgreSQL installer...
echo.
echo Using Chocolatey package manager (installing if needed)...

REM Check if chocolatey is installed
where choco >nul 2>&1
if %errorLevel% neq 0 (
    echo Installing Chocolatey...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))"
    
    REM Refresh environment variables
    call refreshenv
)

echo.
echo Step 3: Installing PostgreSQL 16...
choco install postgresql16 -y --params "/Password:postgres123 /Port:5432"

if %errorLevel% neq 0 (
    echo.
    echo ERROR: PostgreSQL installation failed!
    echo.
    echo Alternative installation methods:
    echo 1. Download manually from: https://www.postgresql.org/download/windows/
    echo 2. Use WSL2: wsl --install, then: sudo apt install postgresql
    pause
    exit /b 1
)

echo.
echo Step 4: Starting PostgreSQL service...
net start postgresql-x64-16

if %errorLevel% neq 0 (
    echo WARNING: Could not start PostgreSQL service automatically
    echo You may need to start it manually from Services
)

echo.
echo Step 5: Waiting for PostgreSQL to be ready...
timeout /t 5 /nobreak >nul

echo.
echo Step 6: Installing pgvector extension...
echo.
echo Downloading pgvector from GitHub...

REM Download pgvector pre-built binary for Windows
powershell -Command "& {Invoke-WebRequest -Uri 'https://github.com/pgvector/pgvector/releases/download/v0.7.0/pgvector-v0.7.0-windows-x64-postgres16.zip' -OutFile '%TEMP%\pgvector.zip'}"

if %errorLevel% neq 0 (
    echo.
    echo WARNING: Could not download pgvector automatically
    echo Please install manually from: https://github.com/pgvector/pgvector
    echo.
    set /p SKIP="Skip pgvector installation? (y/n): "
    if /i not "%SKIP%"=="y" exit /b 1
) else (
    echo Extracting pgvector...
    powershell -Command "Expand-Archive -Path '%TEMP%\pgvector.zip' -DestinationPath '%TEMP%\pgvector' -Force"
    
    REM Find PostgreSQL lib directory
    for /f "tokens=*" %%i in ('dir /s /b "C:\Program Files\PostgreSQL\16\lib" 2^>nul ^| findstr /i "lib$"') do set PGLIB=%%i
    
    if defined PGLIB (
        echo Installing pgvector to PostgreSQL...
        copy /Y "%TEMP%\pgvector\vector.dll" "%PGLIB%\" >nul
        echo pgvector installed successfully!
    ) else (
        echo WARNING: Could not find PostgreSQL lib directory
        echo You may need to install pgvector manually
    )
)

echo.
echo Step 7: Adding PostgreSQL to PATH...
setx PATH "%PATH%;C:\Program Files\PostgreSQL\16\bin" /M >nul

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Default credentials:
echo   Username: postgres
echo   Password: postgres123
echo   Port: 5432
echo.
echo Next steps:
echo   1. Close and reopen your terminal
echo   2. Run: psql -U postgres
echo   3. Run: npm run db:init
echo.
echo Press any key to exit...
pause >nul
