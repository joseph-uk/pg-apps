# Paragliding Apps Data Fetcher (Go Version)

This is a Go implementation of the data fetching script for the Paragliding Apps Directory.

## Features

- Reads app data from CSV file
- Fetches content from each app's website
- Searches Wikipedia for information about each app
- Stores raw HTML and metadata locally
- Rate limits requests to avoid overloading servers

## Usage

### Build the executable

```bash
cd /path/to/pg-apps/process/fetch-data-go
go build
```

### Run the executable

Process all apps:

```bash
./fetch-data-go
```

Process a specific app by name:

```bash
./fetch-data-go "XCTrack"
```

## Output

The script outputs to the `/data/raw/` directory:
- Each app gets its own subdirectory (named based on app name)
- Website HTML content is saved to a file
- Wikipedia content is saved to a file (if found)
- Metadata about the fetch process is saved as JSON