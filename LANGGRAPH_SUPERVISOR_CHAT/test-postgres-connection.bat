@echo off
echo ========================================
echo Testing Docker PostgreSQL Connection
echo ========================================
echo.

echo Checking if Docker PostgreSQL is running...
docker compose ps postgres
if errorlevel 1 (
    echo [ERROR] PostgreSQL container is not running
    echo.
    echo Please run: start-debug.bat
    pause
    exit /b 1
)

echo.
echo Attempting to connect to PostgreSQL...
docker compose exec postgres psql -U postgres -d insurance_verification -c "SELECT version();"

if errorlevel 1 (
    echo [ERROR] Could not connect to PostgreSQL
    pause
    exit /b 1
)

echo.
echo Checking for pgvector extension...
docker compose exec postgres psql -U postgres -d insurance_verification -c "\dx vector"

echo.
echo Checking feedback_corrections table...
docker compose exec postgres psql -U postgres -d insurance_verification -c "\d feedback_corrections"

echo.
echo Counting records in feedback_corrections...
docker compose exec postgres psql -U postgres -d insurance_verification -c "SELECT COUNT(*) as total_feedback_records FROM feedback_corrections;"

echo.
echo ========================================
echo Connection Test Complete!
echo ========================================
pause
