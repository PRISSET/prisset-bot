@echo off
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js not found. Installing...
    echo Downloading Node.js installer...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\node-install.msi'"
    echo Installing Node.js...
    msiexec /i "%TEMP%\node-install.msi" /qn
    del "%TEMP%\node-install.msi"
    echo Node.js installed. Restarting script...
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

if not exist node_modules (
    echo Installing dependencies...
    npm install
)

node bot.js
pause
