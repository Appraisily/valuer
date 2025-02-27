@echo off
rem Resumable Scraper Runner Script for Windows
rem This script is designed to be run by Windows Task Scheduler to scrape large categories
rem Usage: run-scraper.bat furniture 55 50 "--sort=auctionDateAsc"

rem Set default values
set CATEGORY=%1
if "%CATEGORY%"=="" set CATEGORY=furniture

set MAX_RUNTIME=%2
if "%MAX_RUNTIME%"=="" set MAX_RUNTIME=55

set BATCH_SIZE=%3
if "%BATCH_SIZE%"=="" set BATCH_SIZE=50

set ADDITIONAL_ARGS=%4
if "%ADDITIONAL_ARGS%"=="" set ADDITIONAL_ARGS=""

rem Set working directory to the project root
cd /d "%~dp0\..\..\"

rem Create logs directory if it doesn't exist
if not exist logs mkdir logs

rem Set log file name
set TIMESTAMP=%date:~-4,4%%date:~-7,2%%date:~-10,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set LOG_FILE=logs\%CATEGORY%-scrape-%TIMESTAMP%.log

rem Run the scraper
echo Starting scraper for category: %CATEGORY% at %date% %time% > %LOG_FILE%
echo Max runtime: %MAX_RUNTIME% minutes >> %LOG_FILE%
echo Batch size: %BATCH_SIZE% pages >> %LOG_FILE%
echo Additional arguments: %ADDITIONAL_ARGS% >> %LOG_FILE%

node src/scripts/resumable-scraper.js --category=%CATEGORY% --maxRuntime=%MAX_RUNTIME% --batchSize=%BATCH_SIZE% %ADDITIONAL_ARGS% >> %LOG_FILE% 2>&1

rem Check exit status
if %ERRORLEVEL% EQU 0 (
  echo Scraper completed successfully at %date% %time% >> %LOG_FILE%
) else (
  echo Scraper failed with exit code %ERRORLEVEL% at %date% %time% >> %LOG_FILE%
)

rem Display completion message
echo Scraper run completed. Check log file at %LOG_FILE%

exit /b %ERRORLEVEL% 