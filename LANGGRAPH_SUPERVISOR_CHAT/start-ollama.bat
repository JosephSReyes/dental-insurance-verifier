@echo off
setlocal enabledelayedexpansion

REM Model to keep alive
set MODEL=gpt-oss:20b

REM Duration to keep model alive, in seconds
set duration=3600
set interval=10

echo Starting Ollama server...
start "Ollama Server" cmd /c "ollama serve"
timeout /t 5 >nul

echo Checking if Ollama server is ready...
ollama ps >nul 2>&1
if %errorlevel% neq 0 (
    echo Ollama server not ready yet. Waiting...
    timeout /t 5 >nul
)

echo Pulling %MODEL% if needed...
ollama pull %MODEL%

echo Warming up model into GPU memory...
ollama run %MODEL% "warm up" >nul

echo ==================================================
echo Model %MODEL% is active. Keeping it alive for %duration% seconds...
echo ==================================================

set /a end=%duration%
set /a elapsed=0

:loop
if !elapsed! GEQ !end! goto finish

REM Keep-alive ping - prevents GPU unload
echo [Keep-Alive] !elapsed!s / %duration!s
ollama run %MODEL% "ping" >nul 2>&1

timeout /t %interval% >nul
set /a elapsed+=%interval%
goto loop

:finish
echo.
echo Finished keeping %MODEL% alive.
echo Exiting script.
endlocal
