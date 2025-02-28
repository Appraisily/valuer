@echo off
REM Run the Unified Scraper example with command line parameters
REM Usage: run-unified-scraper.bat [query] [category] [maxPages]

set QUERY=%1
if "%QUERY%"=="" set QUERY=antique furniture

set CATEGORY=%2
if "%CATEGORY%"=="" set CATEGORY=Furniture

set MAX_PAGES=%3
if "%MAX_PAGES%"=="" set MAX_PAGES=2

echo.
echo Running Unified Scraper with:
echo  - Query: %QUERY%
echo  - Category: %CATEGORY%
echo  - Max Pages: %MAX_PAGES%
echo.

node src/examples/unified-scraper-example.js "%QUERY%" "%CATEGORY%" 250 0 %MAX_PAGES%

echo.
echo Completed. 