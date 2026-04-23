@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Database Setup Script
echo ========================================
echo.

REM Set default PostgreSQL password
set PGPASSWORD=postgres123

echo Step 1: Testing PostgreSQL connection...
psql -U postgres -c "SELECT version();" >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Cannot connect to PostgreSQL!
    echo.
    echo Please make sure:
    echo   1. PostgreSQL is installed: run scripts\install-postgres.bat
    echo   2. PostgreSQL service is running
    echo   3. Password is correct (default: postgres123)
    echo.
    set /p PGPASSWORD="Enter PostgreSQL password for user 'postgres': "
    
    psql -U postgres -c "SELECT version();" >nul 2>&1
    if %errorLevel% neq 0 (
        echo Still cannot connect. Please check your PostgreSQL installation.
        pause
        exit /b 1
    )
)
echo   Connected successfully!
echo.

echo Step 2: Creating database 'insurance_verification'...
psql -U postgres -c "DROP DATABASE IF EXISTS insurance_verification;" >nul 2>&1
psql -U postgres -c "CREATE DATABASE insurance_verification;" >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Database might already exist or could not be created
) else (
    echo   Database created successfully!
)
echo.

echo Step 3: Enabling pgvector extension...
psql -U postgres -d insurance_verification -c "CREATE EXTENSION IF NOT EXISTS vector;" >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Could not enable pgvector extension!
    echo.
    echo pgvector may not be installed. Options:
    echo   1. Run scripts\install-postgres.bat
    echo   2. Install manually from: https://github.com/pgvector/pgvector
    echo.
    set /p CONTINUE="Continue anyway? (y/n): "
    if /i not "!CONTINUE!"=="y" exit /b 1
) else (
    echo   pgvector extension enabled!
)
echo.

echo Step 4: Verifying pgvector installation...
psql -U postgres -d insurance_verification -c "\dx vector" | findstr "vector" >nul 2>&1
if %errorLevel% equ 0 (
    echo   pgvector is working correctly!
) else (
    echo   WARNING: pgvector verification failed
)
echo.

echo Step 5: Setting up .env file...
cd ..\..\..
if not exist ".env" (
    echo Creating .env from .env.example...
    copy .env.example .env >nul
    echo   .env file created!
) else (
    echo   .env file already exists
)

REM Update .env with PostgreSQL settings
powershell -Command "(gc .env) -replace '^POSTGRES_HOST=.*', 'POSTGRES_HOST=localhost' | Out-File -encoding ASCII .env"
powershell -Command "(gc .env) -replace '^POSTGRES_PORT=.*', 'POSTGRES_PORT=5432' | Out-File -encoding ASCII .env"
powershell -Command "(gc .env) -replace '^POSTGRES_DB=.*', 'POSTGRES_DB=insurance_verification' | Out-File -encoding ASCII .env"
powershell -Command "(gc .env) -replace '^POSTGRES_USER=.*', 'POSTGRES_USER=postgres' | Out-File -encoding ASCII .env"
powershell -Command "(gc .env) -replace '^POSTGRES_PASSWORD=.*', 'POSTGRES_PASSWORD=%PGPASSWORD%' | Out-File -encoding ASCII .env"
powershell -Command "(gc .env) -replace '^POSTGRES_SSL=.*', 'POSTGRES_SSL=false' | Out-File -encoding ASCII .env"

echo   .env file configured with PostgreSQL settings
echo.

echo Step 6: Running database migrations...
cd apps\agents
call pnpm run db:init
if %errorLevel% neq 0 (
    echo.
    echo ERROR: Database initialization failed!
    echo Check the error messages above for details.
    pause
    exit /b 1
)
echo.

echo Step 7: Running tests...
call pnpm run db:test
if %errorLevel% neq 0 (
    echo.
    echo WARNING: Some tests failed!
    echo The database is set up but may not be fully functional.
    echo.
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Database: insurance_verification
echo Host: localhost:5432
echo User: postgres
echo.
echo Connection string has been saved to .env
echo.
echo Next steps:
echo   1. Start the review UI: cd apps/web; pnpm dev
echo   2. Submit feedback at: http://localhost:3000/review
echo   3. Run verifications to see RAG in action
echo.
echo You can view the database with:
echo   psql -U postgres -d insurance_verification
echo.
pause
