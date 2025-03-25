package main

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv" // Add this import
)

const (
	// Configuration
	projectRoot    = "/home/joseph/Projects/github/pg-apps"
	dataDir        = projectRoot + "/data"
	csvFile        = dataDir + "/paragliding-apps.csv"
	rawDataDir     = dataDir + "/raw"
	rateLimitPause = 1000 * time.Millisecond // milliseconds between requests
)

var (
	userAgent        = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
	googlePSearchKey string
	googlePSearchID  string
)

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
	Name             string `json:"name"`
	URL              string `json:"url"`
	Platform         string `json:"platform"`
	Type             string `json:"type"`
	ShortDescription string `json:"short_description"`
	Timestamp        string `json:"timestamp"`
	WebsiteFetched   bool   `json:"website_fetched"`
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

// FetchGoogleSearchResults fetches search results for the app name using Google Programmable Search Engine API
func FetchGoogleSearchResults(appName string) (string, error) {
	query := url.QueryEscape(appName)
	apiURL := fmt.Sprintf("https://www.googleapis.com/customsearch/v1?q=%s&key=%s&cx=%s", query, googlePSearchKey, googlePSearchID)

	resp, err := http.Get(apiURL)
	if err != nil {
		return "", fmt.Errorf("failed to fetch search results: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	return string(body), nil
}

// ParseSearchResults parses the search results JSON and extracts URLs
func ParseSearchResults(searchResults string) ([]string, error) {
	var result map[string]interface{}
	err := json.Unmarshal([]byte(searchResults), &result)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal search results: %w", err)
	}

	var urls []string
	if items, ok := result["items"].([]interface{}); ok {
		for _, item := range items {
			if link, ok := item.(map[string]interface{})["link"].(string); ok {
				urls = append(urls, link)
			}
		}
	}

	return urls, nil
}

// FetchAndSaveURLContent fetches and saves the content of a URL if the file does not already exist
func FetchAndSaveURLContent(urlStr, dirPath string, wg *sync.WaitGroup, sem chan struct{}) {
	defer wg.Done()
	sem <- struct{}{}

	filePath := filepath.Join(dirPath, SanitizeName(urlStr)+".html")
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		content, err := FetchURL(urlStr)
		if err != nil {
			fmt.Printf("  Error fetching %s: %v\n", urlStr, err)
			<-sem
			return
		}

		err = ioutil.WriteFile(filePath, []byte(content), 0644)
		if err != nil {
			fmt.Printf("  Error writing file %s: %v\n", filePath, err)
		}
	} else {
		fmt.Printf("  File %s already exists, skipping download.\n", filePath)
	}

	<-sem
}

// FetchURLContent gets content from a URL with error handling
func FetchURLContent(urlStr string) (string, error) {
	if urlStr == "" || strings.TrimSpace(urlStr) == "" {
		return "", fmt.Errorf("invalid URL")
	}

	urlStr = EnsureURLHasProtocol(urlStr)
	return FetchURL(urlStr)
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

	// Fetch Google search results
	searchResultsFile := filepath.Join(appRawDir, safeName+".google-p-search.json")
	if _, err := os.Stat(searchResultsFile); os.IsNotExist(err) {
		fmt.Printf("  Fetching Google search results for: %s\n", app.Name)

		searchResults, err := FetchGoogleSearchResults(app.Name)
		if err != nil {
			fmt.Printf("  Error fetching Google search results: %v\n", err)
		} else {
			err = ioutil.WriteFile(searchResultsFile, []byte(searchResults), 0644)
			if err != nil {
				return nil, fmt.Errorf("failed to write search results file: %w", err)
			}
		}

		// Rate limiting
		time.Sleep(rateLimitPause)
	}

	// Parse search results and fetch URLs
	searchResults, err := ioutil.ReadFile(searchResultsFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read search results file: %w", err)
	}

	urls, err := ParseSearchResults(string(searchResults))
	if err != nil {
		return nil, fmt.Errorf("failed to parse search results: %w", err)
	}

	serpDir := filepath.Join(appRawDir, "serp")
	err = EnsureDirExists(serpDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create serp directory: %w", err)
	}

	var wg sync.WaitGroup
	sem := make(chan struct{}, 10) // Limit to 10 parallel requests

	for _, urlStr := range urls {
		wg.Add(1)
		go FetchAndSaveURLContent(urlStr, serpDir, &wg, sem)
	}

	wg.Wait()

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

// PromptUserForEnvVar prompts the user to enter a value for an environment variable
func PromptUserForEnvVar(envVarName, description string) string {
	reader := bufio.NewReader(os.Stdin)
	fmt.Printf("%s (%s): ", description, envVarName)
	value, _ := reader.ReadString('\n')
	return strings.TrimSpace(value)
}

func WriteEnvFile(envVars map[string]string) error {
	file, err := os.Create(".env")
	if err != nil {
		return fmt.Errorf("failed to create .env file: %w", err)
	}
	defer file.Close()

	writer := bufio.NewWriter(file)
	for key, value := range envVars {
		_, err := writer.WriteString(fmt.Sprintf("%s=%s\n", key, value))
		if err != nil {
			return fmt.Errorf("failed to write to .env file: %w", err)
		}
	}
	return writer.Flush()
}

func main() {
	// Load environment variables from .env file if it exists
	err := godotenv.Load()
	if err != nil {
		fmt.Println("No .env file found, proceeding with environment variables.")
	}

	envVars := make(map[string]string)

	googlePSearchKey = os.Getenv("GOOGLE_P_SEARCH_KEY")
	if googlePSearchKey == "" {
		googlePSearchKey = PromptUserForEnvVar("GOOGLE_P_SEARCH_KEY", "Google Programmable Search Engine API Key")
		envVars["GOOGLE_P_SEARCH_KEY"] = googlePSearchKey
	}

	googlePSearchID = os.Getenv("GOOGLE_P_SEARCH_ID")
	if googlePSearchID == "" {
		googlePSearchID = PromptUserForEnvVar("GOOGLE_P_SEARCH_ID", "Google Programmable Search Engine CX ID")
		envVars["GOOGLE_P_SEARCH_ID"] = googlePSearchID
	}

	if googlePSearchKey == "" || googlePSearchID == "" {
		fmt.Println("Error: GOOGLE_P_SEARCH_KEY and GOOGLE_P_SEARCH_ID environment variables must be set.")
		fmt.Println("Please set these environment variables and try again.")
		os.Exit(1)
	}

	if len(envVars) > 0 {
		err = WriteEnvFile(envVars)
		if err != nil {
			fmt.Printf("Error writing .env file: %v\n", err)
			os.Exit(1)
		}
	}

	err = EnsureDirExists(rawDataDir)
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
