package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil" // deprecated in Go 1.16+, but keeping for compatibility
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	// Configuration
	projectRoot      = "/home/joseph/Projects/github/pg-apps"
	dataDir          = projectRoot + "/data"
	csvFile          = dataDir + "/paragliding-apps.csv"
	rawDataDir       = dataDir + "/raw"
	rateLimitPause   = 1000 * time.Millisecond // milliseconds between requests
)

var userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"

// App represents a paragliding app from the CSV
type App struct {
	Name             string `json:"name"`
	URL              string `json:"url"`
	Platform         string `json:"platform"`
	Type             string `json:"type"`
	ShortDescription string `json:"short_description"`
	Cost             string `json:"cost"`
	Pros             string `json:"pros"`
	Cons             string `json:"cons"`
}

// FetchResult represents the metadata for an app fetch
type FetchResult struct {
	Name             string       `json:"name"`
	URL              string       `json:"url"`
	Platform         string       `json:"platform"`
	Type             string       `json:"type"`
	ShortDescription string       `json:"short_description"`
	Timestamp        string       `json:"timestamp"`
	WebsiteFetched   bool         `json:"website_fetched"`
	Wikipedia        WikipediaInfo `json:"wikipedia"`
}

// WikipediaInfo contains info about Wikipedia content fetch
type WikipediaInfo struct {
	Title   string `json:"title,omitempty"`
	URL     string `json:"url,omitempty"`
	Fetched bool   `json:"fetched"`
}

// WikiSearchResult represents Wikipedia search API response
type WikiSearchResult struct {
	Query struct {
		Search []struct {
			Title string `json:"title"`
		} `json:"search"`
	} `json:"query"`
}

// EnsureDirExists creates a directory if it doesn't exist
func EnsureDirExists(dirPath string) error {
	return os.MkdirAll(dirPath, os.ModePerm)
}

// FetchURL gets content from a URL
func FetchURL(urlStr string) (string, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	
	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("User-Agent", userAgent)
	
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("status code: %d", resp.StatusCode)
	}
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	
	return string(body), nil
}

// FetchURLContent gets content from a URL with error handling
func FetchURLContent(urlStr string) (string, error) {
	if urlStr == "" || strings.TrimSpace(urlStr) == "" {
		return "", fmt.Errorf("invalid URL")
	}
	
	urlStr = EnsureURLHasProtocol(urlStr)
	return FetchURL(urlStr)
}

// FetchWikipediaContent searches Wikipedia for content about an app
func FetchWikipediaContent(appName string) (*WikipediaInfo, string, error) {
	searchURL := fmt.Sprintf("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s&format=json", 
		url.QueryEscape(appName))
		
	searchData, err := FetchURL(searchURL)
	if err != nil {
		return nil, "", err
	}
	
	var searchResult WikiSearchResult
	err = json.Unmarshal([]byte(searchData), &searchResult)
	if err != nil {
		return nil, "", err
	}
	
	if len(searchResult.Query.Search) == 0 {
		return &WikipediaInfo{Fetched: false}, "", nil
	}
	
	pageTitle := searchResult.Query.Search[0].Title
	pageURL := fmt.Sprintf("https://en.wikipedia.org/wiki/%s", 
		url.QueryEscape(strings.ReplaceAll(pageTitle, " ", "_")))
	
	wikiContent, err := FetchURLContent(pageURL)
	if err != nil {
		return nil, "", err
	}
	
	return &WikipediaInfo{
		Title:   pageTitle,
		URL:     pageURL,
		Fetched: true,
	}, wikiContent, nil
}

// ProcessApp processes a single app
func ProcessApp(app App) (*FetchResult, error) {
	fmt.Printf("Processing: %s\n", app.Name)
	
	safeName := SanitizeName(app.Name)
	appRawDir := filepath.Join(rawDataDir, safeName)
	
	err := EnsureDirExists(appRawDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}
	
	result := FetchResult{
		Name:             app.Name,
		URL:              app.URL,
		Platform:         app.Platform,
		Type:             app.Type,
		ShortDescription: app.ShortDescription,
		Timestamp:        time.Now().UTC().Format(time.RFC3339),
	}
	
	// Fetch main URL content
	if app.URL != "" {
		fmt.Printf("  Fetching URL: %s\n", app.URL)
		
		htmlContent, err := FetchURLContent(app.URL)
		if err != nil {
			fmt.Printf("  Error fetching %s: %v\n", app.URL, err)
			result.WebsiteFetched = false
		} else {
			htmlFilePath := filepath.Join(appRawDir, SanitizeName(app.URL)+".html")
			err = ioutil.WriteFile(htmlFilePath, []byte(htmlContent), 0644)
			if err != nil {
				return nil, fmt.Errorf("failed to write HTML file: %w", err)
			}
			result.WebsiteFetched = true
		}
		
		// Rate limiting
		time.Sleep(rateLimitPause)
	}
	
	// Fetch Wikipedia content
	fmt.Printf("  Searching Wikipedia for: %s\n", app.Name)
	
	wikiInfo, wikiContent, err := FetchWikipediaContent(app.Name)
	if err != nil {
		fmt.Printf("  Error searching Wikipedia for %s: %v\n", app.Name, err)
		result.Wikipedia = WikipediaInfo{Fetched: false}
	} else if wikiInfo.Fetched {
		wikiFilePath := filepath.Join(appRawDir, SanitizeName(app.Name)+".wikipedia.html")
		err = ioutil.WriteFile(wikiFilePath, []byte(wikiContent), 0644)
		if err != nil {
			return nil, fmt.Errorf("failed to write Wikipedia file: %w", err)
		}
		result.Wikipedia = *wikiInfo
	} else {
		result.Wikipedia = WikipediaInfo{Fetched: false}
	}
	
	// Save metadata
	metadataPath := filepath.Join(appRawDir, "metadata.json")
	metadataJSON, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal metadata: %w", err)
	}
	
	err = ioutil.WriteFile(metadataPath, metadataJSON, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to write metadata file: %w", err)
	}
	
	fmt.Printf("  Completed processing: %s\n", app.Name)
	return &result, nil
}

// ReadAppsFromCSV reads paragliding apps from the CSV file
func ReadAppsFromCSV() ([]App, error) {
	file, err := os.Open(csvFile)
	if err != nil {
		return nil, fmt.Errorf("failed to open CSV file: %w", err)
	}
	defer file.Close()
	
	reader := csv.NewReader(file)
	
	// Read header
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV header: %w", err)
	}
	
	// Map column indices
	colMap := make(map[string]int)
	for i, colName := range header {
		colMap[strings.ToLower(colName)] = i
	}
	
	var apps []App
	
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to read CSV record: %w", err)
		}
		
		// Skip empty lines
		isEmpty := true
		for _, field := range record {
			if field != "" {
				isEmpty = false
				break
			}
		}
		if isEmpty {
			continue
		}
		
		app := App{}
		
		// Set fields based on header mapping
		if idx, ok := colMap["name"]; ok && idx < len(record) {
			app.Name = record[idx]
		}
		if idx, ok := colMap["url"]; ok && idx < len(record) {
			app.URL = record[idx]
		}
		if idx, ok := colMap["platform"]; ok && idx < len(record) {
			app.Platform = record[idx]
		}
		if idx, ok := colMap["type"]; ok && idx < len(record) {
			app.Type = record[idx]
		}
		if idx, ok := colMap["short description"]; ok && idx < len(record) {
			app.ShortDescription = record[idx]
		}
		if idx, ok := colMap["cost"]; ok && idx < len(record) {
			app.Cost = record[idx]
		}
		if idx, ok := colMap["pros"]; ok && idx < len(record) {
			app.Pros = record[idx]
		}
		if idx, ok := colMap["cons"]; ok && idx < len(record) {
			app.Cons = record[idx]
		}
		
		apps = append(apps, app)
	}
	
	return apps, nil
}

func main() {
	err := EnsureDirExists(rawDataDir)
	if err != nil {
		fmt.Printf("Error creating raw data directory: %v\n", err)
		os.Exit(1)
	}
	
	// Get all apps from CSV
	apps, err := ReadAppsFromCSV()
	if err != nil {
		fmt.Printf("Error reading apps from CSV: %v\n", err)
		os.Exit(1)
	}
	
	// Check if a specific app name was provided as argument
	if len(os.Args) > 1 {
		appName := os.Args[1]
		fmt.Printf("Looking for app: %s\n", appName)
		
		// Find the app by name
		var found bool
		for _, app := range apps {
			if strings.EqualFold(app.Name, appName) {
				_, err := ProcessApp(app)
				if err != nil {
					fmt.Printf("Error processing app %s: %v\n", app.Name, err)
				}
				found = true
				break
			}
		}
		
		if !found {
			fmt.Printf("App '%s' not found in CSV.\n", appName)
		}
	} else {
		// Process all apps
		var results []*FetchResult
		
		for _, app := range apps {
			result, err := ProcessApp(app)
			if err != nil {
				fmt.Printf("Error processing app %s: %v\n", app.Name, err)
				continue
			}
			
			results = append(results, result)
			time.Sleep(rateLimitPause)
		}
		
		// Save overall results
		resultsJSON, err := json.MarshalIndent(results, "", "  ")
		if err != nil {
			fmt.Printf("Error marshaling results: %v\n", err)
			os.Exit(1)
		}
		
		resultsPath := filepath.Join(rawDataDir, "fetch_results.json")
		err = ioutil.WriteFile(resultsPath, resultsJSON, 0644)
		if err != nil {
			fmt.Printf("Error writing results file: %v\n", err)
			os.Exit(1)
		}
		
		fmt.Printf("Completed processing %d apps.\n", len(results))
	}
}