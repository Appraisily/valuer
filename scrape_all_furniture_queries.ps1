# PowerShell script to scrape all furniture queries from Invaluable
# This script calls the API endpoint for each furniture query

# API base URL - using the generic endpoint
$apiBaseUrl = "https://valuer-dev-856401495068.us-central1.run.app/api/invaluable/scrape"

# Define all furniture queries to search for
$queries = @(
    "Seating Furniture",
    "Chair",
    "Armchair",
    "Recliner",
    "Rocking Chair",
    "Wing Chair",
    "Club Chair",
    "Slipper Chair",
    "Folding Chair",
    "Dining Chair",
    "Bar Stool",
    "Stool",
    "Bench",
    "Settee",
    "Loveseat",
    "Sofa",
    "Sectional",
    "Chaise Lounge",
    "Ottoman",
    "Pouf",
    "Bean Bag",
    "Tables",
    "Dining Table",
    "Kitchen Table",
    "Coffee Table",
    "End Table",
    "Side Table",
    "Console Table",
    "Nesting Table",
    "Drop-leaf Table",
    "Drum Table",
    "Bedside Table",
    "Nightstand",
    "Desks & Work Surfaces",
    "Desk",
    "Writing Desk",
    "Computer Desk",
    "Standing Desk",
    "Secretary Desk",
    "Roll-top Desk",
    "Lap Desk",
    "Storage & Organization",
    "Wardrobe",
    "Armoire",
    "Closet System",
    "Chifforobe",
    "Chest of Drawers",
    "Dresser",
    "Tallboy",
    "Sideboard",
    "Buffet",
    "Credenza",
    "Hutch",
    "China Cabinet",
    "Display Cabinet",
    "Bookcase",
    "Bookshelf",
    "Étagère",
    "Shelf",
    "TV Stand",
    "Media Console",
    "Entertainment Center",
    "Filing Cabinet",
    "Lockers",
    "Trunk",
    "Safe",
    "Beds & Sleep Furniture",
    "Bed",
    "Single Bed",
    "Twin Bed",
    "Double Bed",
    "Full Bed",
    "Queen Bed",
    "King Bed",
    "Four-poster Bed",
    "Canopy Bed",
    "Daybed",
    "Sofa Bed",
    "Futon",
    "Murphy Bed",
    "Bunk Bed",
    "Loft Bed",
    "Bedroom Adjuncts",
    "Vanity",
    "Dressing Table",
    "Office Furniture",
    "Office Desk",
    "Executive Desk",
    "Cubicle Partition",
    "Conference Table",
    "Office Chair",
    "Task Chair",
    "Executive Chair",
    "Swivel Chair",
    "Outdoor & Patio Furniture",
    "Patio Table",
    "Outdoor Chair",
    "Adirondack Chair",
    "Deck Chair",
    "Outdoor Bench",
    "Garden Bench",
    "Picnic Table",
    "Lounge Chair",
    "Hammock",
    "Room Divider",
    "Screen",
    "Coat Rack",
    "Hat Stand",
    "Hall Tree",
    "Umbrella Stand",
    "Serving Cart",
    "Bar Cart",
    "Trolley",
    "Piano Bench",
    "Pedestal",
    "Lectern"
)

# Function to URL encode spaces in query names
function UrlEncode($text) {
    return [System.Uri]::EscapeDataString($text)
}

Write-Host "Starting scraping of all furniture queries..."
Write-Host "=============================================="

# Create results directory if it doesn't exist
$resultsDir = "furniture_queries_results"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir | Out-Null
    Write-Host "Created results directory: $resultsDir"
}

$totalQueries = $queries.Length
$currentQuery = 0

# Loop through each query and call the API
foreach ($query in $queries) {
    $currentQuery++
    $encodedQuery = UrlEncode($query)
    
    Write-Host ""
    Write-Host "[$currentQuery/$totalQueries] Scraping: $query" -ForegroundColor Green
    
    # Call the API endpoint with the keyword/query structure
    # - keyword=furniture (folder name)
    # - query=specific furniture query (subfolder name)
    curl "$apiBaseUrl`?fetchAllPages=true&keyword=furniture&query=$encodedQuery"
    
    # Don't wait after the last query
    if ($currentQuery -lt $totalQueries) {
        Write-Host "`nCompleted $query. Waiting 2 seconds before next request...`n"
        Start-Sleep -Seconds 2
    } else {
        Write-Host "`nCompleted $query (final query)`n"
    }
}

Write-Host "=============================================="
Write-Host "All furniture queries have been processed ($totalQueries total)." -ForegroundColor Green 