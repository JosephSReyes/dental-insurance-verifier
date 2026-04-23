@echo off
echo ========================================
echo PostgreSQL Database Setup
echo ========================================
echo.
echo PostgreSQL is installed and running on port 5432.
echo.
echo Please enter the PostgreSQL superuser password you set during installation:
set /p PGPASS="Password for user 'postgres': "

echo.
echo Testing connection...
set PGPASSWORD=%PGPASS%
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -p 5432 -c "SELECT version();" -t
if %errorLevel% neq 0 (
    echo.
    echo ERROR: Could not connect to PostgreSQL.
    echo Please verify the password is correct.
    pause
    exit /b 1
)

echo.
echo ✓ Connection successful!
echo.
echo Creating database 'insurance_verification'...
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -p 5432 -c "DROP DATABASE IF EXISTS insurance_verification;"
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -p 5432 -c "CREATE DATABASE insurance_verification;"

echo.
echo Enabling pgvector extension...
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -p 5432 -d insurance_verification -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo.
echo ✓ Database created and pgvector enabled!
echo.
echo Updating .env file...
cd C:\Users\josep\PycharmProjects\agent-chat-demo\LANGGRAPH_SUPERVISOR_CHAT

REM Backup existing .env if it exists
if exist .env copy .env .env.backup

REM Create or update .env
(
echo POSTGRES_HOST=localhost
echo POSTGRES_PORT=5432
echo POSTGRES_USER=postgres
echo POSTGRES_PASSWORD=%PGPASS%
echo POSTGRES_DB=insurance_verification
echo.
echo # PostgreSQL Connection String ^(alternative^)
echo POSTGRES_URL=postgresql://postgres:%PGPASS%@localhost:5432/insurance_verification
) > .env.postgres

echo.
echo ✓ PostgreSQL credentials saved to .env.postgres
echo.
echo Please merge these settings into your .env file or rename:
echo   copy .env.postgres .env
echo.
echo Next steps:
echo   1. cd apps\agents
echo   2. pnpm run db:init
echo   3. pnpm run db:test
echo.
pause
