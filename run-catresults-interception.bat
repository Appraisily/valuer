@echo off
REM Run the catResults interception example with command line parameters
REM Usage: run-catresults-interception.bat [query] [category]

set QUERY=%1
if "%QUERY%"=="" set QUERY=antique furniture

set CATEGORY=%2
if "%CATEGORY%"=="" set CATEGORY=Furniture

echo.
echo Running catResults Interception Example with:
echo  - Query: %QUERY%
echo  - Category: %CATEGORY%
echo.

node src/examples/catresults-interception-example.js "%QUERY%" "%CATEGORY%"

echo.
echo Completed. 