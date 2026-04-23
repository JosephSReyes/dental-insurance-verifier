@echo off
echo [INFO] Checking Docker Desktop status...
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>NUL | find /I /N "Docker Desktop.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [INFO] Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo [INFO] Waiting for Docker to start...
    timeout /t 20 /nobreak >nul
)

rem echo [INFO] Configuring Ollama...
rem echo host = '127.0.0.1:8001' > %USERPROFILE%\.ollama\config

rem echo [INFO] Starting Ollama service...
rem start "" cmd /c "ollama serve"
rem timeout /t 5 /nobreak >nul

rem echo [INFO] Starting OpenWebUI on port 3001...
rem docker rm -f ollama-webui 2>nul
rem docker run -d --restart=always ^
rem     -p 3001:8080 ^
rem     -v ollama-webui:/app/backend/data ^
rem     --name ollama-webui ^
rem     -e OLLAMA_HOST=http://host.docker.internal:8001 ^
rem     ghcr.io/open-webui/open-webui:main

echo [INFO] Waiting for services to start...
timeout /t 5 /nobreak >nul

echo [INFO] Starting main services using Turbo...
pnpm run dev

pause