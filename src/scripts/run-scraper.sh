#!/bin/bash
# Resumable Scraper Runner Script
# This script is designed to be run by a cron job to scrape large categories
# Usage: ./run-scraper.sh furniture 55 50

# Set default values
CATEGORY=${1:-"furniture"}
MAX_RUNTIME=${2:-55}
BATCH_SIZE=${3:-50}
ADDITIONAL_ARGS=${4:-""}

# Set working directory to the project root
cd "$(dirname "$0")/../.."

# Log file path
LOG_DIR="logs"
mkdir -p $LOG_DIR
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
LOG_FILE="$LOG_DIR/${CATEGORY}-scrape-${TIMESTAMP}.log"

# Environment variables
export NODE_ENV=${NODE_ENV:-"production"}

# Run the scraper with specified parameters
echo "Starting scraper for category: $CATEGORY at $(date)" | tee -a $LOG_FILE
echo "Max runtime: $MAX_RUNTIME minutes" | tee -a $LOG_FILE
echo "Batch size: $BATCH_SIZE pages" | tee -a $LOG_FILE
echo "Additional arguments: $ADDITIONAL_ARGS" | tee -a $LOG_FILE

# Run the scraper
node src/scripts/resumable-scraper.js \
  --category=$CATEGORY \
  --maxRuntime=$MAX_RUNTIME \
  --batchSize=$BATCH_SIZE \
  $ADDITIONAL_ARGS 2>&1 | tee -a $LOG_FILE

# Check exit status
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "Scraper completed successfully at $(date)" | tee -a $LOG_FILE
else
  echo "Scraper failed with exit code $EXIT_CODE at $(date)" | tee -a $LOG_FILE
fi

# Send summary stats
COMPLETED_PAGES=$(grep -oP "Already completed: \K\d+" $LOG_FILE | tail -1)
FAILED_PAGES=$(grep -oP "Failed pages: \K\d+" $LOG_FILE | tail -1)
REMAINING_MINUTES=$(grep -oP "Estimated time for remaining.*: \K[\d\.]+" $LOG_FILE | tail -1)
PROGRESS_PCT=$(grep -oP "Progress: \d+/\d+ \(\K[\d\.]+(?=%\))" $LOG_FILE | tail -1)

echo "=== SCRAPE SUMMARY ===" | tee -a $LOG_FILE
echo "Category: $CATEGORY" | tee -a $LOG_FILE
echo "Completed pages: ${COMPLETED_PAGES:-0}" | tee -a $LOG_FILE
echo "Failed pages: ${FAILED_PAGES:-0}" | tee -a $LOG_FILE
echo "Estimated time remaining: ${REMAINING_MINUTES:-Unknown} minutes" | tee -a $LOG_FILE
echo "Progress: ${PROGRESS_PCT:-0}%" | tee -a $LOG_FILE
echo "Log file: $LOG_FILE" | tee -a $LOG_FILE

exit $EXIT_CODE 