@echo off
REM DuckDNS IP updater - runs on startup
REM Updates anontweet.duckdns.org with current public IP

REM Load config
for /f "tokens=1,* delims==" %%A in (duckdns.env) do (
    if "%%A"=="DUCKDNS_DOMAIN" set DUCKDNS_DOMAIN=%%B
    if "%%A"=="DUCKDNS_TOKEN" set DUCKDNS_TOKEN=%%B
)

REM Get current public IP
for /f "delims=" %%i in ('curl -s https://api.ipify.org') do set PUBLIC_IP=%%i

REM Update DuckDNS
curl -s "https://www.duckdns.org/update?domains=%DUCKDNS_DOMAIN%&token=%DUCKDNS_TOKEN%&ip=%PUBLIC_IP%"

REM Log result
echo [%date% %time%] Updated DuckDNS %DUCKDNS_DOMAIN%.duckdns.org to %PUBLIC_IP% >> "%~dp0duckdns.log"
