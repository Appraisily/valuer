@echo off
echo Running scraper for "antique" in "furniture" category, 5 pages...
curl -X POST http://localhost:8080/api/scraper/start -H "Content-Type: application/json" -d "{\"query\":\"antique\",\"category\":\"furniture\",\"maxPages\":5,\"saveToGcs\":true,\"gcsBucket\":\"invaluable-data\"}"
echo.
echo If successful, the server is now processing the request in the background.
echo Check the server console for progress updates.
pause 