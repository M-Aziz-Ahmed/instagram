@echo off
REM DuckDNS IP updater - runs on startup
REM Updates anontweet.duckdns.org with current public IP

SETLOCAL
SET "CONFIG=%~dp0duckdns.env"

REM Load config
for /f "usebackq tokens=1,* delims==" %%A in ("%CONFIG%") do (
    if "%%A"=="DUCKDNS_DOMAIN" set "DUCKDNS_DOMAIN=%%B"
    if "%%A"=="DUCKDNS_TOKEN" set "DUCKDNS_TOKEN=%%B"
)

IF "%DUCKDNS_DOMAIN%"=="" GOTO :FAIL
IF "%DUCKDNS_TOKEN%"=="" GOTO :FAIL

REM Get current public IP
for /f "delims=" %%i in ('curl -s --max-time 30 https://api.ipify.org') do set "PUBLIC_IP=%%i"

IF "%PUBLIC_IP%"=="" GOTO :FAIL

REM Update DuckDNS
curl -s --max-time 30 "https://www.duckdns.org/update?domains=%DUCKDNS_DOMAIN%&token=%DUCKDNS_TOKEN%&ip=%PUBLIC_IP%"

REM Log result
echo [%date% %time%] Updated DuckDNS %DUCKDNS_DOMAIN%.duckdns.org to %PUBLIC_IP% >> "%~dp0duckdns.log"
ENDLOCAL
GOTO :EOF

:FAIL
echo [%date% %time%] DuckDNS update FAILED (missing config or IP) >> "%~dp0duckdns.log"
ENDLOCAL