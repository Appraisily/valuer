# PowerShell script to scrape all collectibles subcategories from Invaluable
# This script calls the API endpoint for each subcategory of collectibles

# API base URL - using the new generic endpoint
$apiBaseUrl = "https://valuer-dev-856401495068.us-central1.run.app/api/invaluable/scrape"

# Define all subcategories in the Collectibles category
$subcategories = @(
    "Coins, Money & Stamps",
    "Books, Maps & Manuscripts",
    "Memorabilia",
    "Autographs",
    "Military & Wartime",
    "Couture, Fashion & Accessories",
    "Ephemera, Cards & Documents",
    "Tools",
    "General",
    "Musical Instruments & Equipment"
)

# Function to URL encode spaces in subcategory names
function UrlEncode($text) {
    return [System.Uri]::EscapeDataString($text)
}

Write-Host "Starting scraping of all collectibles subcategories..."
Write-Host "====================================================="

# Create results directory if it doesn't exist
$resultsDir = "collectibles_results"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir | Out-Null
    Write-Host "Created results directory: $resultsDir"
}

# Loop through each subcategory and call the API
foreach ($subcategory in $subcategories) {
    $encodedSubcategory = UrlEncode($subcategory)
    
    Write-Host ""
    Write-Host "Scraping: $subcategory" -ForegroundColor Green
    
    # Call the API endpoint with the new keyword/query structure
    # - keyword=collectible (folder name)
    # - query=collectible (subfolder name)
    # - category=Collectibles (for URL building)
    curl "$apiBaseUrl/$encodedSubcategory`?fetchAllPages=true&keyword=collectible&query=collectible&category=Collectibles"
    
    Write-Host "`nCompleted $subcategory. Waiting 10 seconds before next request...`n"
    Start-Sleep -Seconds 10
}

Write-Host "====================================================="
Write-Host "All collectibles subcategories have been processed." -ForegroundColor Green 