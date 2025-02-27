# Time-Limited Resumable Scraper

A powerful scraping solution designed to handle large-scale data collection from Invaluable.com with time constraints. This system allows you to spread the scraping of thousands of pages across multiple runs, automatically picking up where it left off.

## Key Features

- **Time-Limited Execution**: Automatically stops before reaching a specified time limit
- **Resumable**: Picks up exactly where the previous run left off
- **Progress Tracking**: Detailed statistics and checkpoints stored in GCS
- **Adaptive Rate Limiting**: Smart delays with exponential backoff for errors
- **Detailed Logging**: Comprehensive logs for monitoring and debugging
- **Configurable**: Extensive command-line options for customization

## Usage

### Basic Command

```bash
node src/scripts/resumable-scraper.js --category=furniture --maxRuntime=55 --batchSize=100
```

### With Runner Script

```bash
./src/scripts/run-scraper.sh furniture 55 100 "--sort=auctionDateAsc --upcoming=false"
```

## Setting Up Cron Jobs

To automatically run the scraper at scheduled intervals:

### Linux/macOS

1. Make the runner script executable:
   ```bash
   chmod +x src/scripts/run-scraper.sh
   ```

2. Add a cron job (edit with `crontab -e`):
   ```
   # Run furniture scraper every hour
   0 * * * * cd /path/to/project && ./src/scripts/run-scraper.sh furniture 55 100 >> /var/log/cron.log 2>&1
   ```

3. For multiple categories:
   ```
   # Run furniture scraper every hour
   0 * * * * cd /path/to/project && ./src/scripts/run-scraper.sh furniture 55 100 >> /var/log/cron.log 2>&1
   
   # Run fine-art scraper every hour at 30 minutes past
   30 * * * * cd /path/to/project && ./src/scripts/run-scraper.sh fine-art 55 100 >> /var/log/cron.log 2>&1
   ```

### Windows

1. Create a batch file wrapper (e.g., `run-scraper.bat`):
   ```batch
   @echo off
   cd /d %~dp0\..\..
   node src/scripts/resumable-scraper.js --category=%1 --maxRuntime=%2 --batchSize=%3 %4
   ```

2. Set up a scheduled task using Task Scheduler:
   - Program/script: `C:\path\to\project\run-scraper.bat`
   - Arguments: `furniture 55 100 "--sort=auctionDateAsc --upcoming=false"`
   - Start in: `C:\path\to\project`
   - Schedule: Daily, repeat task every 1 hour for 24 hours

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--category` | Category to scrape | `furniture` |
| `--maxRuntime` | Maximum runtime in minutes | `55` |
| `--batchSize` | Maximum pages to process per run | `50` |
| `--maxPages` | Maximum pages for the category | `1781` |
| `--gcsEnabled` | Enable Google Cloud Storage | `true` |
| `--gcsBucket` | GCS bucket name | `invaluable-html-archive` |
| `--gcsPathPrefix` | Path prefix in the bucket | `invaluable-data` |
| `--baseDelay` | Base delay between requests (ms) | `2000` |
| `--maxDelay` | Maximum delay for backoff (ms) | `15000` |
| `--headless` | Run in headless mode | `true` |
| `--logLevel` | Logging verbosity | `info` |

## Example Run Process

Here's what happens during a typical scraper run:

1. **Initialization**:
   - Load previous progress from GCS
   - Initialize browser and scraper
   - Determine total pages if not already known

2. **Planning**:
   - Calculate how many pages can be processed within the time limit
   - Set up batch processing

3. **Execution**:
   - Process pages one by one, saving each to GCS
   - Periodically check time limits
   - Save progress checkpoints regularly

4. **Finalization**:
   - Save final progress
   - Generate statistics
   - Prepare for next run

## Monitoring Progress

Progress is stored in GCS at:
```
gs://invaluable-html-archive/invaluable-data/[category]/scrape_progress.json
```

This file contains:
- Total pages in the category
- Pages completed so far
- Failed pages
- Running statistics
- Estimated time remaining
- Run history

## Dealing with Failures

The scraper implements several strategies for handling failures:

1. **Automatic Retries**: Failed pages are tracked and can be retried in future runs
2. **Exponential Backoff**: Increasing delays when errors occur
3. **Progress Preservation**: Even if a run crashes, progress is preserved

## Performance Tuning

To optimize performance:

- Adjust `batchSize` based on observed performance
- Modify `baseDelay` to balance speed vs. detection risk
- For very large categories, increase `maxDelay` to avoid rate limiting

## Storage Structure

Results are stored in Google Cloud Storage with the following structure:

```
gs://invaluable-html-archive/
  └── invaluable-data/
      └── [category]/
          ├── scrape_progress.json  # Progress tracking
          ├── pages_001.json        # Page 1 results
          ├── pages_002.json        # Page 2 results
          └── ...
```

## Statistics and Reporting

The script generates detailed statistics after each run:
- Pages processed in this run
- Total pages processed so far
- Success rate
- Average time per page
- Estimated time remaining for the entire category

## Troubleshooting

Common issues and solutions:

- **Browser initialization fails**: Check system resources and Chrome installation
- **GCS access errors**: Verify credentials and permissions
- **Rate limiting**: Increase delays between requests
- **Inconsistent results**: Check for changes in Invaluable's page structure 